import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EventEmitter from 'eventemitter3';
import { Platform } from 'react-native';
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

  constructor() {
    super();
    this.baseDir = `${FileSystem.documentDirectory}models`;
    this.initializeDirectory();
    this.resumePendingDownloads();
    
    // Check for downloads that might have completed in the background
    setTimeout(() => {
      this.checkBackgroundDownloads();
    }, 2000); // Delay to allow the app to initialize
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
      const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
      const downloads = JSON.parse(pendingDownloads);

      for (const [downloadId, data] of Object.entries(downloads)) {
        const { url, filename } = data as { url: string; filename: string };
        const numericDownloadId = Number(downloadId);
        
        // Check if we have a saved resumable for this download
        const savedResumableData = await AsyncStorage.getItem(`download_resumable_${downloadId}`);
        
        if (savedResumableData) {
          try {
            console.log(`Resuming download ${downloadId} for ${filename} from saved state`);
            
            // Try to resume from the saved data
            const resumable = await FileSystem.createDownloadResumable(
              url,
              `${this.baseDir}/${filename}`,
              {},
              (downloadProgress) => {
                if (downloadProgress.totalBytesWritten && downloadProgress.totalBytesExpectedToWrite) {
                  const progress = {
                    progress: Math.round((downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100),
                    bytesDownloaded: downloadProgress.totalBytesWritten,
                    totalBytes: downloadProgress.totalBytesExpectedToWrite,
                    status: 'downloading',
                    downloadId: numericDownloadId
                  };
                  
                  this.downloadProgress[filename] = progress;
                  
                  this.emit('downloadProgress', { modelName: filename, ...progress });
                }
              }
            ).resumeFromData(JSON.parse(savedResumableData));
            
            this.downloadResumables.set(numericDownloadId, resumable);
            
            // Start the resumed download
            resumable.downloadAsync().then(result => {
              if (result) {
                this.removePendingDownload(numericDownloadId);
                this.downloadResumables.delete(numericDownloadId);
                AsyncStorage.removeItem(`download_resumable_${downloadId}`);
                
                const finalProgress = {
                  progress: 100,
                  bytesDownloaded: result.totalBytesWritten || 0,
                  totalBytes: result.totalBytesWritten || 0,
                  status: 'completed',
                  downloadId: numericDownloadId
                };
                
                this.downloadProgress[filename] = finalProgress;
                this.emit('downloadProgress', { modelName: filename, ...finalProgress });
                
                setTimeout(() => {
                  delete this.downloadProgress[filename];
                }, 1000);
              }
            }).catch(error => {
              console.error('Error resuming download:', error);
              // If resuming fails, start a new download
              this.startNewDownload(numericDownloadId, url, filename);
            });
            
            continue; // Skip starting a new download since we resumed
          } catch (error) {
            console.error('Error creating resumable from saved data:', error);
            // Fall through to start a new download
          }
        }
        
        // If we couldn't resume, start a new download
        await this.startNewDownload(numericDownloadId, url, filename);
      }
    } catch (err) {
      console.error('Error resuming downloads:', err);
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
          
          this.emit('downloadProgress', { modelName: filename, ...progress });
          
          // Update notification with progress (but not too frequently to avoid notification spam)
          // Only update every 5% progress change
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
      
      // Save the resumable data to AsyncStorage for potential resumption after app restart
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        try {
          const resumableData = await downloadResumable.savable();
          await AsyncStorage.setItem(`download_resumable_${downloadId}`, JSON.stringify(resumableData));
        } catch (error) {
          console.error('Error saving resumable data:', error);
        }
      }

      const result = await downloadResumable.downloadAsync();
      
      if (result) {
        await this.removePendingDownload(downloadId);
        this.downloadResumables.delete(downloadId);
        
        // Remove the saved resumable data
        await AsyncStorage.removeItem(`download_resumable_${downloadId}`);
        
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
      
      // Wait a short time to ensure the UI updates before removing from progress
      setTimeout(() => {
        // Remove from download progress after emitting the failed event
        delete this.downloadProgress[filename];
      }, 1000);
      
      await this.removePendingDownload(downloadId);
      this.downloadResumables.delete(downloadId);
      
      // Remove the saved resumable data
      await AsyncStorage.removeItem(`download_resumable_${downloadId}`);
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
    if (this.operationsInProgress.has(downloadId)) {
      console.log(`Operation already in progress for download ${downloadId}: ${this.operationsInProgress.get(downloadId)}`);
      return;
    }
    
    this.operationsInProgress.set(downloadId, 'pause');
    
    const downloadResumable = this.downloadResumables.get(downloadId);
    if (downloadResumable) {
      try {
        const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
        const downloads = JSON.parse(pendingDownloads);
        const downloadInfo = downloads[downloadId];
        const currentProgress = this.downloadProgress[downloadInfo?.filename];
        
        if (downloadInfo && currentProgress) {
          try {
            const resumableData = await downloadResumable.savable();
            await AsyncStorage.setItem(`download_resumable_${downloadId}`, JSON.stringify(resumableData));
          } catch (error) {
            console.error('Error saving resumable data before pause:', error);
          }
          
          await downloadResumable.pauseAsync();
          
          const pausedProgress = {
            ...currentProgress,
            status: 'paused'
          };
          
          this.downloadProgress[downloadInfo.filename] = pausedProgress;
          
          this.emit('downloadProgress', {
            modelName: downloadInfo.filename,
            ...pausedProgress
          });
          
          // Show download paused notification
          await notificationService.showDownloadPausedNotification(downloadInfo.filename, downloadId);
        }
      } catch (error) {
        console.error('Error pausing download:', error);
        
        const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
        const downloads = JSON.parse(pendingDownloads);
        const downloadInfo = downloads[downloadId];
        
        if (downloadInfo) {
          this.emit('downloadProgress', {
            modelName: downloadInfo.filename,
            ...this.downloadProgress[downloadInfo.filename],
            error: 'Failed to pause download'
          });
        }
        
        throw error;
      } finally {
        this.operationsInProgress.delete(downloadId);
      }
    }
  }

  async resumeDownload(downloadId: number): Promise<void> {
    if (this.operationsInProgress.has(downloadId)) {
      console.log(`Operation already in progress for download ${downloadId}: ${this.operationsInProgress.get(downloadId)}`);
      return;
    }
    
    this.operationsInProgress.set(downloadId, 'resume');
    
    const downloadResumable = this.downloadResumables.get(downloadId);
    if (downloadResumable) {
      try {
        const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
        const downloads = JSON.parse(pendingDownloads);
        const downloadInfo = downloads[downloadId];
        const currentProgress = this.downloadProgress[downloadInfo?.filename];
        
        if (downloadInfo && currentProgress) {
          // Show download resumed notification
          await notificationService.showDownloadResumedNotification(downloadInfo.filename, downloadId);
          
          const result = await downloadResumable.resumeAsync();
          
          if (result) {
            await this.removePendingDownload(downloadId);
            this.downloadResumables.delete(downloadId);
            await AsyncStorage.removeItem(`download_resumable_${downloadId}`);
            
            const finalProgress = {
              progress: 100,
              bytesDownloaded: result.totalBytesWritten || 0,
              totalBytes: result.totalBytesWritten || 0,
              status: 'completed',
              downloadId
            };
            
            this.downloadProgress[downloadInfo.filename] = finalProgress;
            this.emit('downloadProgress', { modelName: downloadInfo.filename, ...finalProgress });
            
            // Show download completed notification
            await notificationService.showDownloadCompletedNotification(downloadInfo.filename, downloadId);
            
            setTimeout(() => {
              delete this.downloadProgress[downloadInfo.filename];
            }, 1000);
            
            return;
          }
          
          const resumedProgress = {
            ...currentProgress,
            status: 'downloading'
          };
          
          this.downloadProgress[downloadInfo.filename] = resumedProgress;
          
          this.emit('downloadProgress', {
            modelName: downloadInfo.filename,
            ...resumedProgress
          });
        }
      } catch (error) {
        console.error('Error resuming download:', error);
        
        const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
        const downloads = JSON.parse(pendingDownloads);
        const downloadInfo = downloads[downloadId];
        
        if (downloadInfo) {
          this.emit('downloadProgress', {
            modelName: downloadInfo.filename,
            ...this.downloadProgress[downloadInfo.filename],
            error: 'Failed to resume download'
          });
        }
        
        throw error;
      } finally {
        this.operationsInProgress.delete(downloadId);
      }
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
}

export const modelDownloader = new ModelDownloader(); 