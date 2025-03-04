import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EventEmitter from 'eventemitter3';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { notificationService } from './NotificationService';

export interface DownloadProgress {
  [key: string]: {
    progress: number;
    bytesDownloaded: number;
    totalBytes: number;
    status: string;
    downloadId: number;
    isProcessing?: boolean;
    error?: string;
  };
}

export interface ModelInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
}

export interface StoredModel {
  name: string;
  path: string;
  size: number;
  modified: string;
}

export interface DownloadStatus {
  status: string;
  bytesDownloaded?: number;
  totalBytes?: number;
  reason?: string;
}

class ModelDownloader extends EventEmitter {
  private readonly baseDir: string;
  private downloadResumables: Map<number, FileSystem.DownloadResumable> = new Map();
  private nextDownloadId = 1;
  private downloadProgress: Record<string, {
    progress: number;
    bytesDownloaded: number;
    totalBytes: number;
    status: string;
    downloadId: number;
  }> = {};
  private operationsInProgress: Map<number, string> = new Map();
  private appState: AppStateStatus = AppState.currentState;

  constructor() {
    super();
    this.baseDir = `${FileSystem.documentDirectory}models`;
    this.initializeDirectory();
    this.setupAppStateListener();
    this.resumePendingDownloads();
    
    // Check for downloads that might have completed in the background
    setTimeout(() => {
      this.checkBackgroundDownloads();
    }, 2000);
  }

  private setupAppStateListener() {
    AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (this.appState === 'active' && nextAppState.match(/inactive|background/)) {
      // App is going to background, save all active downloads
      await this.saveAllDownloadStates();
    } else if (this.appState.match(/inactive|background/) && nextAppState === 'active') {
      // App is coming to foreground
      await this.resumePendingDownloads();
    }
    this.appState = nextAppState;
  };

  private async saveAllDownloadStates() {
    try {
      // Save all current download states
      for (const [downloadId, downloadResumable] of this.downloadResumables.entries()) {
        const filename = this.operationsInProgress.get(downloadId);
        if (filename && this.downloadProgress[filename]) {
          const currentProgress = this.downloadProgress[filename];
          
          // Skip if already paused
          if (currentProgress.status === 'paused') {
            continue;
          }
          
          try {
            // Get resumable data
            const resumableData = await downloadResumable.savable();
            
            // Get URL from pending downloads
            const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
            const downloads = JSON.parse(pendingDownloads);
            const downloadInfo = downloads[downloadId];
            
            if (downloadInfo) {
              // Update status to paused
              currentProgress.status = 'paused';
              
              // Save all necessary data for resumption
              await Promise.all([
                // Save progress
                this.saveProgressToStorage(filename, {
                  ...currentProgress,
                  downloadId
                }),
                
                // Save the resumable data with URL
                AsyncStorage.setItem(
                  `download_resumable_${downloadId}`,
                  JSON.stringify({
                    url: downloadInfo.url,
                    options: downloadResumable.options,
                    resumeData: resumableData
                  })
                ),
                
                // Ensure pending download is saved
                this.savePendingDownload(downloadId, downloadInfo.url, filename)
              ]);
              
              try {
                // Only try to pause if not already paused
                await downloadResumable.pauseAsync();
              } catch (pauseError) {
                console.log('Download may already be paused:', pauseError.message);
              }
              
              // Emit the paused state
              this.emit('downloadProgress', { modelName: filename, ...currentProgress });
            }
          } catch (error) {
            console.error('Error saving individual download state:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error in saveAllDownloadStates:', error);
    }
  }

  private async initializeDirectory() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
      }
    } catch (error) {
      console.error('Failed to initialize directory:', error);
    }
  }

  private async savePendingDownload(downloadId: number, url: string, filename: string) {
    try {
      const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
      const downloads = JSON.parse(pendingDownloads);
      downloads[downloadId] = { url, filename };
      await AsyncStorage.setItem('pendingDownloads', JSON.stringify(downloads));
    } catch (err) {
      console.error('Error saving pending download:', err);
    }
  }

  private async resumePendingDownloads() {
    try {
      // Clear existing maps to prevent stale data
      this.downloadResumables.clear();
      this.operationsInProgress.clear();
      this.downloadProgress = {};
      
      // Load all saved progress first
      const savedProgress = await AsyncStorage.getItem('download_progress') || '{}';
      const allProgress = JSON.parse(savedProgress);
      
      // Load pending downloads
      const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
      const downloads = JSON.parse(pendingDownloads);

      // First restore all progress states
      for (const [filename, progress] of Object.entries(allProgress)) {
        this.downloadProgress[filename] = progress as any;
        
        // Emit the current state immediately so UI can show it
        this.emit('downloadProgress', { 
          modelName: filename, 
          ...progress 
        });
      }

      // Then handle resumables
      for (const [downloadId, data] of Object.entries(downloads)) {
        const { url, filename } = data as { url: string; filename: string };
        const numericDownloadId = Number(downloadId);
        
        // Check if we have a saved resumable for this download
        const savedResumableData = await AsyncStorage.getItem(`download_resumable_${downloadId}`);
        
        if (savedResumableData) {
          try {
            const resumableData = JSON.parse(savedResumableData);
            
            // Create a new download resumable with the saved URL
            const downloadResumable = FileSystem.createDownloadResumable(
              resumableData.url || url, // Use saved URL if available
              `${this.baseDir}/${filename}`,
              resumableData.options,
              this.createProgressCallback(numericDownloadId, filename),
              resumableData.resumeData
            );

            // Store the resumable in our map
            this.downloadResumables.set(numericDownloadId, downloadResumable);
            
            // Map the downloadId to filename for operations
            this.operationsInProgress.set(numericDownloadId, filename);

            // Make sure we have progress info
            if (!this.downloadProgress[filename]) {
                  const progress = {
                downloadId: numericDownloadId,
                progress: 0,
                bytesDownloaded: 0,
                totalBytes: 0,
                status: 'paused'
                  };
                  
                  this.downloadProgress[filename] = progress;
              await this.saveProgressToStorage(filename, progress);
            }
            
            // Always ensure the status is paused when restoring
            this.downloadProgress[filename].status = 'paused';
            await this.saveProgressToStorage(filename, this.downloadProgress[filename]);
            
            // Emit the current state
            this.emit('downloadProgress', { 
              modelName: filename, 
              ...this.downloadProgress[filename]
            });

          } catch (error) {
            console.error('Error reconstructing download:', error);
            // Don't clean up on error - let the user retry
            console.error('Download reconstruction failed but keeping data for retry');
          }
        }
      }
    } catch (error) {
      console.error('Error in resumePendingDownloads:', error);
    }
  }

  private createProgressCallback(downloadId: number, filename: string) {
    return (downloadProgress: FileSystem.DownloadProgressData) => {
      if (downloadProgress.totalBytesWritten && downloadProgress.totalBytesExpectedToWrite) {
        const progress = {
          progress: Math.round((downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100),
          bytesDownloaded: downloadProgress.totalBytesWritten,
          totalBytes: downloadProgress.totalBytesExpectedToWrite,
          status: 'downloading',
          downloadId
        };
        
        this.downloadProgress[filename] = progress;
        this.emit('downloadProgress', { modelName: filename, ...progress });
      }
    };
  }

  private async saveDownloadState(downloadId: number, state: any) {
    try {
      const states = JSON.parse(await AsyncStorage.getItem('download_states') || '{}');
      states[downloadId] = state;
      await AsyncStorage.setItem('download_states', JSON.stringify(states));
    } catch (error) {
      console.error('Error saving download state:', error);
    }
  }

  private async removePendingDownload(downloadId: number) {
    try {
      const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
      const downloads = JSON.parse(pendingDownloads);
      delete downloads[downloadId];
      await AsyncStorage.setItem('pendingDownloads', JSON.stringify(downloads));
    } catch (err) {
      console.error('Error removing pending download:', err);
    }
  }

  private async saveProgressToStorage(filename: string, progress: any) {
    try {
      const savedProgress = await AsyncStorage.getItem('download_progress') || '{}';
      const allProgress = JSON.parse(savedProgress);
      allProgress[filename] = progress;
      await AsyncStorage.setItem('download_progress', JSON.stringify(allProgress));
    } catch (error) {
      console.error('Error saving download progress:', error);
    }
  }

  private async removeProgressFromStorage(filename: string) {
    try {
      const savedProgress = await AsyncStorage.getItem('download_progress') || '{}';
      const allProgress = JSON.parse(savedProgress);
      delete allProgress[filename];
      await AsyncStorage.setItem('download_progress', JSON.stringify(allProgress));
    } catch (error) {
      console.error('Error removing download progress:', error);
    }
  }

  async downloadModel(url: string, filename: string): Promise<{ downloadId: number; path: string }> {
    const downloadId = this.nextDownloadId++;
    await this.savePendingDownload(downloadId, url, filename);
    await this.startNewDownload(downloadId, url, filename);

    return {
      downloadId,
      path: `${this.baseDir}/${filename}`
    };
  }

  private async startNewDownload(downloadId: number, url: string, filename: string) {
    // Create download options with background download support
    const downloadOptions: FileSystem.DownloadOptions = {
      cache: false
    };
    
    // Add background download capability if supported by the platform
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      // @ts-ignore - The type definitions don't include these options
      downloadOptions.requiresNetworkSession = true;
      // @ts-ignore - The type definitions don't include these options
      downloadOptions.allowsBackgroundSessionDownloads = true;
    }

    // Map the downloadId to filename BEFORE creating the download
    this.operationsInProgress.set(downloadId, filename);

    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      `${this.baseDir}/${filename}`,
      downloadOptions,
      (downloadProgress) => {
        if (downloadProgress.totalBytesWritten && downloadProgress.totalBytesExpectedToWrite) {
          const progress = {
            progress: Math.round((downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100),
            bytesDownloaded: downloadProgress.totalBytesWritten,
            totalBytes: downloadProgress.totalBytesExpectedToWrite,
            status: 'downloading',
            downloadId
          };
          
          this.downloadProgress[filename] = progress;
          
          // Save progress to AsyncStorage
          this.saveProgressToStorage(filename, progress).catch(error => {
            console.error('Error saving progress:', error);
          });
          
          this.emit('downloadProgress', { modelName: filename, ...progress });
          
          // Update notification with progress
          if (progress.progress % 5 === 0 || progress.progress === 100) {
            notificationService.updateDownloadProgressNotification(
              filename,
              downloadId,
              progress.progress,
              progress.bytesDownloaded,
              progress.totalBytes
            );
          }
        }
      }
    );

    this.downloadResumables.set(downloadId, downloadResumable);

    try {
      // Show download started notification
      await notificationService.showDownloadStartedNotification(filename, downloadId);
      
      // Save initial download state
      const initialState = {
        status: 'downloading',
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0
      };
      
      await this.saveDownloadState(downloadId, initialState);
      await this.saveProgressToStorage(filename, {
        ...initialState,
        downloadId
      });
      
      // Save the resumable data to AsyncStorage for potential resumption after app restart
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        try {
          const resumableData = await downloadResumable.savable();
          await AsyncStorage.setItem(`download_resumable_${downloadId}`, JSON.stringify({
            options: downloadOptions,
            resumeData: resumableData
          }));
        } catch (error) {
          console.error('Error saving resumable data:', error);
        }
      }

      const result = await downloadResumable.downloadAsync();
      
      if (result) {
        await this.removePendingDownload(downloadId);
        this.downloadResumables.delete(downloadId);
        this.operationsInProgress.delete(downloadId);
        
        // Remove the saved resumable data and state
        await AsyncStorage.removeItem(`download_resumable_${downloadId}`);
        await AsyncStorage.removeItem(`download_states_${downloadId}`);
        await this.removeProgressFromStorage(filename);
        
        const finalProgress = {
          progress: 100,
          bytesDownloaded: result.totalBytesWritten || 0,
          totalBytes: result.totalBytesWritten || 0,
          status: 'completed',
          downloadId
        };
        
        // First update the progress in our internal state
        this.downloadProgress[filename] = finalProgress;
        
        // Then emit the event
        this.emit('downloadProgress', { modelName: filename, ...finalProgress });
        
        // Show download completed notification
        await notificationService.showDownloadCompletedNotification(filename, downloadId);
        
        // Wait a short time to ensure the UI updates before removing from progress
        setTimeout(() => {
          // Remove from download progress after emitting the completed event
          delete this.downloadProgress[filename];
          this.emit('downloadProgress', { modelName: filename, ...finalProgress });
        }, 1000);
      }
    } catch (error) {
      console.error('Download error:', error);
      const failedProgress = {
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'failed',
        downloadId
      };
      
      // First update the progress in our internal state
      this.downloadProgress[filename] = failedProgress;
      
      // Then emit the event
      this.emit('downloadProgress', { modelName: filename, ...failedProgress });
      
      // Show download failed notification
      await notificationService.showDownloadFailedNotification(filename, downloadId);
      
      // Clean up failed download
      await this.removePendingDownload(downloadId);
      this.downloadResumables.delete(downloadId);
      this.operationsInProgress.delete(downloadId);
      
      // Remove the saved resumable data and state
      await AsyncStorage.removeItem(`download_resumable_${downloadId}`);
      await AsyncStorage.removeItem(`download_states_${downloadId}`);
      await this.removeProgressFromStorage(filename);
      
      // Wait a short time to ensure the UI updates before removing from progress
      setTimeout(() => {
        // Remove from download progress after emitting the failed event
        delete this.downloadProgress[filename];
        this.emit('downloadProgress', { modelName: filename, ...failedProgress });
      }, 1000);
    }
  }

  async cancelDownload(downloadId: number): Promise<boolean> {
    const downloadResumable = this.downloadResumables.get(downloadId);
    if (downloadResumable) {
      try {
        // Get the filename from pending downloads
        const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
        const downloads = JSON.parse(pendingDownloads);
        const downloadInfo = downloads[downloadId] as { filename: string } | undefined;
        
        // Construct the full path
        const filePath = downloadInfo 
          ? `${this.baseDir}/${downloadInfo.filename}`
          : null;

        // Pause/cancel the download
        await downloadResumable.pauseAsync();
        this.downloadResumables.delete(downloadId);
        await this.removePendingDownload(downloadId);
        
        // Remove the saved resumable data
        await AsyncStorage.removeItem(`download_resumable_${downloadId}`);

        // Delete the partial file if we have the path
        if (filePath) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(filePath, { idempotent: true });
            }
          } catch (error) {
            console.error('Error deleting partial file:', error);
          }
        }
        
        // Cancel any notifications for this download
        await notificationService.cancelDownloadNotification(downloadId);

        return true;
      } catch (error) {
        console.error('Error cancelling download:', error);
        return false;
      }
    }
    return false;
  }

  async checkDownloadStatus(downloadId: number): Promise<DownloadStatus> {
    const downloadResumable = this.downloadResumables.get(downloadId);
    if (!downloadResumable) {
      return {
        status: 'unknown',
        bytesDownloaded: 0,
        totalBytes: 0
      };
    }

    try {
      const result = await downloadResumable.downloadAsync();
      if (result) {
        // If downloadAsync returns a result, the download is completed
        return {
          status: 'completed',
          bytesDownloaded: result.totalBytesWritten || 0,
          totalBytes: result.totalBytesWritten || 0
        };
      } else {
        // Check if we have progress information for this download
        const filename = Object.keys(this.downloadProgress).find(
          key => this.downloadProgress[key].downloadId === downloadId
        );
        
        if (filename) {
          const progress = this.downloadProgress[filename];
          // If progress is 100%, consider it completed
          if (progress.progress === 100) {
            return {
              status: 'completed',
              bytesDownloaded: progress.bytesDownloaded,
              totalBytes: progress.totalBytes
            };
          }
          
          return {
            status: progress.status,
            bytesDownloaded: progress.bytesDownloaded,
            totalBytes: progress.totalBytes
          };
        }
        
        return {
          status: 'unknown',
          bytesDownloaded: 0,
          totalBytes: 0
        };
      }
    } catch (error) {
      console.error('Error checking download status:', error);
      return {
        status: 'failed',
        reason: error.message
      };
    }
  }

  async getStoredModels(): Promise<StoredModel[]> {
    try {
      const files = await FileSystem.readDirectoryAsync(this.baseDir);
      const models = await Promise.all(
        files.map(async (filename) => {
          const path = `${this.baseDir}/${filename}`;
          const info = await FileSystem.getInfoAsync(path);
          return {
            name: filename,
            path,
            size: info.size || 0,
            modified: new Date().toISOString()
          };
        })
      );
      return models;
    } catch (error) {
      console.error('Error getting stored models:', error);
      return [];
    }
  }

  async deleteModel(path: string): Promise<boolean> {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        await FileSystem.deleteAsync(path);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting model:', error);
      return false;
    }
  }

  async pauseDownload(downloadId: number): Promise<void> {
    const downloadResumable = this.downloadResumables.get(downloadId);
    if (!downloadResumable) {
      throw new Error('Download not found');
    }

    try {
      const filename = this.operationsInProgress.get(downloadId);
      if (!filename) {
        throw new Error('Download operation not found');
      }

      // Get the URL from pending downloads
        const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
        const downloads = JSON.parse(pendingDownloads);
        const downloadInfo = downloads[downloadId];
      
      if (!downloadInfo) {
        throw new Error('Download info not found');
      }

      // Save resumable data BEFORE pausing
      const resumableData = await downloadResumable.savable();
      
      if (this.downloadProgress[filename]) {
        const currentProgress = this.downloadProgress[filename];
        currentProgress.status = 'paused';
        
        // Save all necessary data for resumption
        await Promise.all([
          // Save the current progress
          this.saveProgressToStorage(filename, {
            ...currentProgress,
            downloadId
          }),
          
          // Save the resumable data with URL
          AsyncStorage.setItem(
            `download_resumable_${downloadId}`,
            JSON.stringify({
              url: downloadInfo.url,
              options: downloadResumable.options,
              resumeData: resumableData
            })
          ),
          
          // Make sure pending download is saved
          this.savePendingDownload(downloadId, downloadInfo.url, filename)
        ]);
        
        // Pause the download but keep it in our maps
        await downloadResumable.pauseAsync();
        
        // Emit the paused state
        this.emit('downloadProgress', { modelName: filename, ...currentProgress });
      }
    } catch (error) {
      console.error('Error pausing download:', error);
      throw error;
    }
  }

  async resumeDownload(downloadId: number): Promise<void> {
    const downloadResumable = this.downloadResumables.get(downloadId);
    if (!downloadResumable) {
      throw new Error('Download not found');
    }

    try {
      const filename = this.operationsInProgress.get(downloadId);
      if (!filename) {
        throw new Error('Download operation not found');
      }

      if (this.downloadProgress[filename]) {
        this.downloadProgress[filename].status = 'downloading';
        
        // Update the state to downloading
        await this.saveDownloadState(downloadId, {
          status: 'downloading',
          progress: this.downloadProgress[filename].progress,
          bytesDownloaded: this.downloadProgress[filename].bytesDownloaded,
          totalBytes: this.downloadProgress[filename].totalBytes
        });

        // Save progress to AsyncStorage
        await this.saveProgressToStorage(filename, {
          ...this.downloadProgress[filename],
          downloadId
        });
        
        this.emit('downloadProgress', { modelName: filename, ...this.downloadProgress[filename] });
      }
          
          const result = await downloadResumable.resumeAsync();
          
          if (result) {
        // Clean up after successful download
            await this.removePendingDownload(downloadId);
            this.downloadResumables.delete(downloadId);
        this.operationsInProgress.delete(downloadId);
            await AsyncStorage.removeItem(`download_resumable_${downloadId}`);
        await AsyncStorage.removeItem(`download_states_${downloadId}`);
        await this.removeProgressFromStorage(filename);
            
            const finalProgress = {
              progress: 100,
              bytesDownloaded: result.totalBytesWritten || 0,
              totalBytes: result.totalBytesWritten || 0,
              status: 'completed',
              downloadId
            };
            
        if (this.downloadProgress[filename]) {
          this.downloadProgress[filename] = finalProgress;
          this.emit('downloadProgress', { modelName: filename, ...finalProgress });
            
            setTimeout(() => {
            delete this.downloadProgress[filename];
            this.emit('downloadProgress', { modelName: filename, ...finalProgress });
            }, 1000);
        }
        }
      } catch (error) {
        console.error('Error resuming download:', error);
        throw error;
    }
  }

  async checkBackgroundDownloads() {
    try {
      // Check if any downloads completed in the background
      const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
      const downloads = JSON.parse(pendingDownloads);
      
      for (const [downloadId, data] of Object.entries(downloads)) {
        const { filename } = data as { url: string; filename: string };
        const filePath = `${this.baseDir}/${filename}`;
        
        // Check if the file exists and is complete
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists) {
          // If the file exists but we still have it in pending downloads,
          // it might have completed in the background
          console.log(`Found potentially completed background download: ${filename}`);
          
          // Remove from pending downloads
          await this.removePendingDownload(Number(downloadId));
          
          // Remove any saved resumable data
          await AsyncStorage.removeItem(`download_resumable_${downloadId}`);
          
          // Emit a completed event
          const finalProgress = {
            progress: 100,
            bytesDownloaded: fileInfo.size || 0,
            totalBytes: fileInfo.size || 0,
            status: 'completed',
            downloadId: Number(downloadId)
          };
          
          this.emit('downloadProgress', { 
            modelName: filename, 
            ...finalProgress 
          });
        }
      }
    } catch (error) {
      console.error('Error checking background downloads:', error);
    }
  }

  public cleanup() {
    AppState.removeEventListener('change', this.handleAppStateChange);
  }
}

export const modelDownloader = new ModelDownloader(); 