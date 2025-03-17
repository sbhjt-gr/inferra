import RNBackgroundDownloader from '@kesha-antonov/react-native-background-downloader';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState, AppStateStatus, NativeModules, Alert } from 'react-native';
import * as Device from 'expo-device';
import { downloadNotificationService } from './DownloadNotificationService';
import { notificationService } from './NotificationService';

type Listener = (...args: any[]) => void;

class EventEmitter {
  private events: { [key: string]: Listener[] } = {};

  on(event: string, listener: Listener): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  off(event: string, listener: Listener): void {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }

  emit(event: string, ...args: any[]): boolean {
    if (!this.events[event]) return false;
    this.events[event].forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
    return true;
  }

  removeAllListeners(event?: string): void {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }
}

interface ActiveDownload {
  downloadId: number;
  filename: string;
  url: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: 'queued' | 'downloading' | 'completed' | 'failed';
  timestamp: number;
  destination?: string;
  options?: FileSystem.DownloadOptions;
}

interface DownloadTaskInfo {
  task: any;
  downloadId: number;
  modelName: string;
  progress?: number;
  bytesDownloaded?: number;
  totalBytes?: number;
  destination?: string;
  url?: string;
}

export interface DownloadProgress {
  [key: string]: {
    progress: number;
    bytesDownloaded: number;
    totalBytes: number;
    status: string;
    downloadId: number;
    isProcessing?: boolean;
    error?: string;
    isPaused?: boolean;
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
  isExternal?: boolean;
}

export interface DownloadStatus {
  status: string;
  bytesDownloaded?: number;
  totalBytes?: number;
  reason?: string;
}

class ModelDownloader extends EventEmitter {
  private readonly baseDir: string;
  private readonly downloadDir: string;
  private activeDownloads: Map<string, DownloadTaskInfo> = new Map();
  private nextDownloadId = 1;
  private appState: AppStateStatus = AppState.currentState;
  private isInitialized: boolean = false;
  private hasNotificationPermission: boolean = false;
  private _notificationSubscription: any = null;
  private wasOpenedViaNotification: boolean = false;
  private externalModels: StoredModel[] = [];
  private readonly EXTERNAL_MODELS_KEY = 'external_models';
  private readonly DOWNLOAD_PROGRESS_KEY = 'download_progress_state';

  constructor() {
    super();
    this.baseDir = `${FileSystem.documentDirectory}models`;
    this.downloadDir = `${FileSystem.documentDirectory}temp`;  // Use a temp directory for downloads
    this.initialize();
  }

  private async initialize() {
    try {
      // Initialize directories
      await this.initializeDirectory();
      
      // Load next download ID
      const savedId = await AsyncStorage.getItem('next_download_id');
      if (savedId) {
        this.nextDownloadId = parseInt(savedId, 10);
      }

      // Load external models
      await this.loadExternalModels();

      // Load saved download progress
      await this.loadDownloadProgress();

      // Set up app state change listener
      AppState.addEventListener('change', this.handleAppStateChange);
      
      // Check for existing background downloads
      try {
        console.log('[ModelDownloader] Checking for existing background downloads...');
        
        const existingTasks = await RNBackgroundDownloader.checkForExistingDownloads();
        console.log(`[ModelDownloader] Found ${existingTasks.length} existing background downloads`);
        
        // Re-attach to existing downloads
        for (const task of existingTasks) {
          console.log(`[ModelDownloader] Re-attaching to download: ${task.id}`);
          
          // Extract model name from task id
          const modelName = task.id;
          
          // Create download info
          const downloadInfo = {
            task,
            downloadId: this.nextDownloadId++,
            modelName,
            destination: `${this.downloadDir}/${modelName}`,
          };
          
          // Add to active downloads
          this.activeDownloads.set(modelName, downloadInfo);
          
          // Attach handlers
          this.attachDownloadHandlers(task);
          
          // Emit progress event to update UI
          this.emit('downloadProgress', {
            modelName,
            progress: task.bytesDownloaded / (task.bytesTotal || 1) * 100,
            bytesDownloaded: task.bytesDownloaded,
            totalBytes: task.bytesTotal || 0,
            status: 'downloading',
            downloadId: downloadInfo.downloadId
          });
        }
      } catch (error) {
        console.error('[ModelDownloader] Error checking for existing downloads:', error);
      }

      // Load active downloads
      await this.checkForExistingDownloads();

      // Immediately check for any completed downloads in temp directory
      await this.processCompletedDownloads();

      this.isInitialized = true;
      
      // Clean up temp directory
      await this.cleanupTempDirectory();
    } catch (error) {
      console.error('Error initializing model downloader:', error);
    }
  }

  private async setupNotifications() {
    if (Platform.OS === 'android') {
      await downloadNotificationService.requestPermissions();
    }
  }

  private async requestNotificationPermissions(): Promise<boolean> {
    if (Device.isDevice) {
      if (Platform.OS === 'android') {
        const granted = await downloadNotificationService.requestPermissions();
        this.hasNotificationPermission = granted;
        return granted;
      }
    }
    return false;
  }

  private async initializeDirectory() {
    try {
      console.log('[ModelDownloader] Initializing directories...');
      console.log('[ModelDownloader] Models directory:', this.baseDir);
      console.log('[ModelDownloader] Temp directory:', this.downloadDir);
      
      // Check if models directory exists
      const modelsDirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!modelsDirInfo.exists) {
        console.log('[ModelDownloader] Models directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
      } else {
        console.log('[ModelDownloader] Models directory already exists');
      }
      
      // Check if temp directory exists
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        console.log('[ModelDownloader] Temp directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.downloadDir, { intermediates: true });
      } else {
        console.log('[ModelDownloader] Temp directory already exists');
      }
      
      // List contents of models directory
      try {
        const modelFiles = await FileSystem.readDirectoryAsync(this.baseDir);
        console.log(`[ModelDownloader] Found ${modelFiles.length} files in models directory:`, modelFiles);
      } catch (error) {
        console.error('[ModelDownloader] Error listing models directory:', error);
      }
      
      // List contents of temp directory
      try {
        const tempFiles = await FileSystem.readDirectoryAsync(this.downloadDir);
        console.log(`[ModelDownloader] Found ${tempFiles.length} files in temp directory:`, tempFiles);
      } catch (error) {
        console.error('[ModelDownloader] Error listing temp directory:', error);
      }
    } catch (error) {
      console.error('[ModelDownloader] Error initializing directories:', error);
      throw error;
    }
  }

  private async checkForExistingDownloads() {
    try {
      const savedDownloads = await AsyncStorage.getItem('active_downloads');
      if (savedDownloads) {
        const downloads = JSON.parse(savedDownloads);
        console.log('[ModelDownloader] Found saved downloads:', downloads);

        for (const [modelName, downloadState] of Object.entries(downloads)) {
          const { downloadId, destination, url, progress, bytesDownloaded, totalBytes, status } = downloadState as any;
          
          // Check if the file exists in temp directory
          const fileInfo = await FileSystem.getInfoAsync(destination);
          if (fileInfo.exists) {
            console.log(`[ModelDownloader] Found existing download for ${modelName}`);
            
            // Re-emit progress event
            this.emit('downloadProgress', {
              modelName,
              progress,
              bytesDownloaded,
              totalBytes,
              status,
              downloadId
            });
          } else {
            console.log(`[ModelDownloader] Temp file not found for ${modelName}, cleaning up state`);
            // File doesn't exist, emit failed status
            this.emit('downloadProgress', {
              modelName,
              progress: 0,
              bytesDownloaded: 0,
              totalBytes: 0,
              status: 'failed',
              downloadId,
              error: 'Download file not found'
            });
            
            // Clean up the download state
            const downloadInfo = {
              downloadId,
              destination,
              modelName,
              url
            };
            await this.cleanupDownload(modelName, downloadInfo as DownloadTaskInfo);
          }
        }
      }
    } catch (error) {
      console.error('[ModelDownloader] Error checking for existing downloads:', error);
    }
  }

  // Add a method to ensure downloads are running
  async ensureDownloadsAreRunning() {
    try {
      console.log('Ensuring downloads are running...');
      await RNBackgroundDownloader.ensureDownloadsAreRunning();
      console.log('Downloads should now be running');
    } catch (error) {
      console.error('Error ensuring downloads are running:', error);
    }
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus) => {
    console.log('[ModelDownloader] App state changed to:', nextAppState);
    
    // Only cancel downloads when app is closed (removed from recents)
    // 'inactive' means the app is being closed/removed from recents
    if (nextAppState === 'inactive') {
      console.log('[ModelDownloader] App is being closed, cancelling all downloads');
      
      // Cancel all active downloads
      for (const [modelName, download] of Object.entries(this.activeDownloads)) {
        try {
          await this.cancelDownload(download.downloadId);
          this.emit('downloadProgress', {
            modelName,
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            status: 'failed',
            downloadId: download.downloadId,
            error: 'Download cancelled - app was closed'
          });
        } catch (error) {
          console.error(`[ModelDownloader] Error cancelling download for ${modelName}:`, error);
        }
      }
      
      // Clear active downloads
      this.activeDownloads = {};
    }
  };

  private async persistActiveDownloads() {
    try {
      const downloadsToSave = Array.from(this.activeDownloads.entries()).reduce((acc, [modelName, info]) => {
        acc[modelName] = {
          downloadId: info.downloadId,
          destination: info.destination,
          url: info.url,
          progress: info.progress || 0,
          bytesDownloaded: info.bytesDownloaded || 0,
          totalBytes: info.totalBytes || 0,
          status: info.status || 'downloading'
        };
        return acc;
      }, {} as Record<string, any>);

      await AsyncStorage.setItem('active_downloads', JSON.stringify(downloadsToSave));
      console.log('[ModelDownloader] Persisted active downloads:', downloadsToSave);
    } catch (error) {
      console.error('[ModelDownloader] Error persisting active downloads:', error);
    }
  }

  private async showNotification(title: string, body: string, data?: any) {
    // Only show notifications on Android through native notification service
    if (Platform.OS === 'android') {
      try {
        if (data && data.modelName && data.downloadId) {
          if (data.action === 'download_complete') {
            await downloadNotificationService.showNotification(
              data.modelName,
              data.downloadId,
              100
            );
          } else if (data.action === 'download_started') {
            await downloadNotificationService.showNotification(
              data.modelName,
              data.downloadId,
              0
            );
          } else if (data.action === 'download_cancelled') {
            await downloadNotificationService.cancelNotification(data.downloadId);
          }
        }
      } catch (error) {
        console.error('[ModelDownloader] Error showing notification:', error);
      }
    }
  }

  private attachDownloadHandlers(task: any) {
    // Store expected total bytes from begin event
    let expectedTotalBytes = 0;
    const downloadInfo = this.activeDownloads.get(task.id);

    if (!downloadInfo) {
      console.error(`[ModelDownloader] No download info found for task ${task.id}`);
      return;
    }

    // Begin event - fired when download starts
    task.begin((data: any) => {
      const expectedBytes = data.expectedBytes || 0;
      console.log(`[ModelDownloader] Download started for ${task.id}, expected bytes: ${expectedBytes}`);
      expectedTotalBytes = expectedBytes;

      // Update download info
      downloadInfo.totalBytes = expectedBytes;
      
      const progressData = {
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: expectedBytes,
        status: 'downloading',
        downloadId: downloadInfo.downloadId
      };

      // Save progress state
      this.saveDownloadProgress(downloadInfo.modelName, progressData);
      
      // Emit progress event
      this.emit('downloadProgress', {
        modelName: downloadInfo.modelName,
        ...progressData
      });

      // Show notification based on platform
      if (Platform.OS === 'android') {
        downloadNotificationService.showNotification(
          downloadInfo.modelName,
          downloadInfo.downloadId,
          0
        );
      } else {
        notificationService.showDownloadStartedNotification(
          downloadInfo.modelName,
          downloadInfo.downloadId
        );
      }
    });
    
    // Progress event - fired periodically during download
    task.progress((data: any) => {
      const bytesDownloaded = data.bytesDownloaded || 0;
      const bytesTotal = data.bytesTotal || expectedTotalBytes || 1;
      
      // Calculate progress percentage
      const progress = Math.round((bytesDownloaded / bytesTotal) * 100);
      
      // Update download info
      downloadInfo.progress = progress;
      downloadInfo.bytesDownloaded = bytesDownloaded;
      downloadInfo.totalBytes = bytesTotal;

      const progressData = {
        progress,
        bytesDownloaded,
        totalBytes: bytesTotal,
        status: 'downloading',
        downloadId: downloadInfo.downloadId
      };

      // Save progress state
      this.saveDownloadProgress(downloadInfo.modelName, progressData);

      // Emit progress event
      this.emit('downloadProgress', {
        modelName: downloadInfo.modelName,
        ...progressData
      });

      // Update notification based on platform
      if (Platform.OS === 'android') {
        downloadNotificationService.updateProgress(
          downloadInfo.downloadId,
          progress
        );
      } else {
        notificationService.updateDownloadProgressNotification(
          downloadInfo.modelName,
          downloadInfo.downloadId,
          progress,
          bytesDownloaded,
          bytesTotal
        );
      }
    });
    
    // Done event - fired when download completes successfully
    task.done(async () => {
      console.log(`[ModelDownloader] Download completed for ${task.id}`);
      
      try {
        const tempPath = downloadInfo.destination || `${this.downloadDir}/${downloadInfo.modelName}`;
        const modelPath = `${this.baseDir}/${downloadInfo.modelName}`;
        
        // Check if temp file exists
        const tempInfo = await FileSystem.getInfoAsync(tempPath, { size: true });
        
        if (tempInfo.exists) {
          const tempSize = (tempInfo as any).size || 0;
          
          // Move file to models directory
          await this.moveFile(tempPath, modelPath);
          console.log(`[ModelDownloader] Moved ${downloadInfo.modelName} from temp to models directory`);
          
          const progressData = {
            progress: 100,
            bytesDownloaded: tempSize,
            totalBytes: tempSize,
            status: 'completed',
            downloadId: downloadInfo.downloadId
          };

          // Clear progress state since download is complete
          await this.clearDownloadProgress(downloadInfo.modelName);

          // Emit completion event
          this.emit('downloadProgress', {
            modelName: downloadInfo.modelName,
            ...progressData
          });

          // Show completion notification based on platform
          if (Platform.OS === 'android') {
            downloadNotificationService.showNotification(
              downloadInfo.modelName,
              downloadInfo.downloadId,
              100
            );
          } else {
            notificationService.showDownloadCompletedNotification(
              downloadInfo.modelName,
              downloadInfo.downloadId
            );
          }
          
          // Clean up download info
          await this.cleanupDownload(downloadInfo.modelName, downloadInfo);
          
          // Refresh stored models list
          await this.refreshStoredModels();
        } else {
          console.error(`[ModelDownloader] Temp file not found for ${downloadInfo.modelName}`);
          
          const progressData = {
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            status: 'failed',
            downloadId: downloadInfo.downloadId,
            error: 'Temp file not found'
          };

          // Clear progress state since download failed
          await this.clearDownloadProgress(downloadInfo.modelName);

          // Emit error event
          this.emit('downloadProgress', {
            modelName: downloadInfo.modelName,
            ...progressData
          });

          // Show error notification based on platform
          if (Platform.OS === 'android') {
            downloadNotificationService.cancelNotification(downloadInfo.downloadId);
          } else {
            notificationService.showDownloadFailedNotification(
              downloadInfo.modelName,
              downloadInfo.downloadId
            );
          }
        }
      } catch (error) {
        console.error(`[ModelDownloader] Error handling download completion for ${downloadInfo.modelName}:`, error);
        
        const progressData = {
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          status: 'failed',
          downloadId: downloadInfo.downloadId,
          error: 'Error handling download completion'
        };

        // Clear progress state since download failed
        await this.clearDownloadProgress(downloadInfo.modelName);

        // Emit error event
        this.emit('downloadProgress', {
          modelName: downloadInfo.modelName,
          ...progressData
        });

        // Show error notification based on platform
        if (Platform.OS === 'android') {
          downloadNotificationService.cancelNotification(downloadInfo.downloadId);
        } else {
          notificationService.showDownloadFailedNotification(
            downloadInfo.modelName,
            downloadInfo.downloadId
          );
        }
      }
    });
    
    // Error event - fired when download fails
    task.error((data: any) => {
      const error = data.error || 'Unknown error';
      const errorCode = data.errorCode || 0;
      
      console.error(`[ModelDownloader] Download error for ${task.id}:`, error, errorCode);
      
      const progressData = {
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'failed',
        downloadId: downloadInfo.downloadId,
        error: error
      };

      // Clear progress state since download failed
      this.clearDownloadProgress(downloadInfo.modelName);

      // Emit error event
      this.emit('downloadProgress', {
        modelName: downloadInfo.modelName,
        ...progressData
      });
      
      // Show error notification based on platform
      if (Platform.OS === 'android') {
        downloadNotificationService.cancelNotification(downloadInfo.downloadId);
      } else {
        notificationService.showDownloadFailedNotification(
          downloadInfo.modelName,
          downloadInfo.downloadId
        );
      }
      
      // Clean up download info
      this.cleanupDownload(downloadInfo.modelName, downloadInfo);
    });
  }

  private async moveFile(sourcePath: string, destPath: string): Promise<void> {
    console.log(`[ModelDownloader] Moving file from ${sourcePath} to ${destPath}`);
    
    try {
      const modelName = destPath.split('/').pop() || 'model';
      console.log(`[ModelDownloader] Emitting importProgress event for ${modelName} (importing)`);
      
      // Emit event to show importing dialog
      this.emit('importProgress', {
        modelName,
        status: 'importing'
      });

      // Check if source file exists
      const sourceInfo = await FileSystem.getInfoAsync(sourcePath);
      if (!sourceInfo.exists) {
        throw new Error(`Source file does not exist: ${sourcePath}`);
      }
      
      // Check if destination directory exists
      const destDir = destPath.substring(0, destPath.lastIndexOf('/'));
      const destDirInfo = await FileSystem.getInfoAsync(destDir);
      if (!destDirInfo.exists) {
        console.log(`[ModelDownloader] Creating destination directory: ${destDir}`);
        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      }
      
      // Check if destination file already exists
      const destInfo = await FileSystem.getInfoAsync(destPath);
      if (destInfo.exists) {
        console.log(`[ModelDownloader] Destination file already exists, deleting it: ${destPath}`);
        await FileSystem.deleteAsync(destPath, { idempotent: true });
      }
      
      // Move the file
      console.log(`[ModelDownloader] Executing moveAsync from ${sourcePath} to ${destPath}`);
      await FileSystem.moveAsync({
        from: sourcePath,
        to: destPath
      });
      
      // Verify the file was moved
      const newDestInfo = await FileSystem.getInfoAsync(destPath);
      if (!newDestInfo.exists) {
        throw new Error(`File was not moved successfully to ${destPath}`);
      }

      console.log(`[ModelDownloader] Emitting importProgress event for ${modelName} (completed)`);
      // Emit event to hide importing dialog
      this.emit('importProgress', {
        modelName,
        status: 'completed'
      });
      
      console.log(`[ModelDownloader] File successfully moved to ${destPath}`);
    } catch (error) {
      const modelName = destPath.split('/').pop() || 'model';
      console.log(`[ModelDownloader] Emitting importProgress event for ${modelName} (error)`);
      // Emit event to hide importing dialog with error
      this.emit('importProgress', {
        modelName,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      console.error(`[ModelDownloader] Error moving file from ${sourcePath} to ${destPath}:`, error);
      throw error;
    }
  }

  async getFileSize(path: string): Promise<number> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(path);
      if (!fileInfo.exists) {
      return 0;
      }
      
      // Use getInfoAsync with size option
      const statInfo = await FileSystem.getInfoAsync(path, { size: true });
      
      // Use type assertion to access size property
      return ((statInfo as any).size) || 0;
        } catch (error) {
      console.error(`[ModelDownloader] Error getting file size for ${path}:`, error);
      return 0;
    }
  }

  async downloadModel(url: string, modelName: string): Promise<{ downloadId: number }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Request notification permissions only when starting a download
      if (!this.hasNotificationPermission) {
        if (Platform.OS === 'android') {
          // For Android, request permissions for native notifications
          this.hasNotificationPermission = await downloadNotificationService.requestPermissions();
        } else {
          // For iOS, use the existing method
          this.hasNotificationPermission = await this.requestNotificationPermissions();
        }
      }
      
      // Generate a unique download ID
      const downloadId = this.nextDownloadId++;
      await AsyncStorage.setItem('next_download_id', this.nextDownloadId.toString());
      
      // Set destination path
      const destination = `${this.downloadDir}/${modelName}`;
      
      console.log(`[ModelDownloader] Starting download for ${modelName} from ${url}`);
      
      // Create download task with type assertion to avoid TypeScript errors
      const task = RNBackgroundDownloader.download({
        id: modelName,
        url,
        destination,
        headers: {
          'Accept-Ranges': 'bytes'
        }
      } as any);
      
      // Store download info
      const downloadInfo = {
        task,
        downloadId,
        modelName,
        destination,
        url
      };

      // Add to active downloads
      this.activeDownloads.set(modelName, downloadInfo);
      
      // Attach handlers
      this.attachDownloadHandlers(task);

      // Save active downloads
      await this.persistActiveDownloads();

      // Show alert about not removing app from recents
      Alert.alert(
        'Download Started',
        'Please do not remove the app from your recents screen while downloading. Doing so will interrupt the download.',
        [{ text: 'OK', style: 'default' }]
      );
      
      // Return download ID
      return { downloadId };
    } catch (error) {
      console.error(`[ModelDownloader] Error starting download for ${modelName}:`, error);
      throw error;
    }
  }

  async pauseDownload(downloadId: number): Promise<void> {
    console.log(`[ModelDownloader] Attempting to pause download with ID ${downloadId}`);
    
    try {
      // Find the download entry
      let foundEntry: DownloadTaskInfo | undefined;
      let foundModelName = '';
      
      for (const [taskId, entry] of this.activeDownloads.entries()) {
        if (entry.downloadId === downloadId) {
          foundEntry = entry;
          foundModelName = entry.modelName;
          break;
        }
      }
      
      if (!foundEntry) {
        console.warn(`[ModelDownloader] No active download found with ID ${downloadId}`);
        return;
      }
      
      // Check if platform supports pause
      if (Platform.OS === 'ios' && typeof foundEntry.task.pause === 'function') {
        // Pause the download task
        foundEntry.task.pause();
        
        // Show notification on iOS only
        if (Platform.OS === 'ios') {
          notificationService.showDownloadPausedNotification(
            foundModelName,
            downloadId
          );
        }
      } else if (Platform.OS === 'ios') {
        // On iOS but pause not supported
        if (Platform.OS === 'ios') {
          notificationService.showDownloadPauseUnavailableNotification(
            foundModelName,
            downloadId
          );
        }
      }
      // No notifications on Android - we're using native notifications
      
      // Always emit the status update for UI consistency
      this.emit('downloadProgress', {
        modelName: foundModelName,
        progress: foundEntry.progress || 0,
        bytesDownloaded: foundEntry.bytesDownloaded || 0,
        totalBytes: foundEntry.totalBytes || 0,
        status: 'downloading',
        downloadId,
        isPaused: true
      });
    } catch (error) {
      console.error(`[ModelDownloader] Error pausing download:`, error);
    }
  }

  async resumeDownload(downloadId: number): Promise<void> {
    console.log(`[ModelDownloader] Attempting to resume download with ID ${downloadId}`);
    
    try {
      // Find the download entry
      let foundEntry: DownloadTaskInfo | undefined;
      let foundModelName = '';
      
      for (const [taskId, entry] of this.activeDownloads.entries()) {
        if (entry.downloadId === downloadId) {
          foundEntry = entry;
          foundModelName = entry.modelName;
          break;
        }
      }
      
      if (!foundEntry) {
        console.warn(`[ModelDownloader] No active download found with ID ${downloadId}`);
        return;
      }
      
      // Check if platform supports resume
      if (Platform.OS === 'ios' && typeof foundEntry.task.resume === 'function') {
        // Resume the download task
        foundEntry.task.resume();
        
        // Show notification on iOS only
        if (Platform.OS === 'ios') {
          notificationService.showDownloadResumedNotification(
            foundModelName,
            downloadId
          );
        }
      } else if (Platform.OS === 'ios') {
        // On iOS but resume not supported
        if (Platform.OS === 'ios') {
          notificationService.showDownloadResumeUnavailableNotification(
            foundModelName,
            downloadId
          );
        }
      }
      // No notifications on Android - we're using native notifications
      
      // Always emit the status update for UI consistency
      this.emit('downloadProgress', {
        modelName: foundModelName,
        progress: foundEntry.progress || 0,
        bytesDownloaded: foundEntry.bytesDownloaded || 0,
        totalBytes: foundEntry.totalBytes || 0,
        status: 'downloading',
        downloadId,
        isPaused: false
      });
    } catch (error) {
      console.error(`[ModelDownloader] Error resuming download:`, error);
    }
  }

  private async cleanupDownload(modelName: string, downloadInfo: DownloadTaskInfo) {
    try {
      console.log(`[ModelDownloader] Cleaning up download for ${modelName}`);
      
      // Clean up temp file if it exists
      if (downloadInfo.destination) {
        const tempInfo = await FileSystem.getInfoAsync(downloadInfo.destination);
        if (tempInfo.exists) {
          console.log(`[ModelDownloader] Cleaning up temp file: ${downloadInfo.destination}`);
          await FileSystem.deleteAsync(downloadInfo.destination);
        }
      }

      // Cancel notification on Android
      if (Platform.OS === 'android' && downloadInfo.downloadId) {
        await downloadNotificationService.cancelNotification(downloadInfo.downloadId);
      }
      
      // Remove from active downloads
      this.activeDownloads.delete(modelName);
      
      // Clear progress state
      await this.clearDownloadProgress(modelName);
      
      // Update persisted active downloads
      await this.persistActiveDownloads();
      
      console.log(`[ModelDownloader] Cleanup completed for ${modelName}`);
    } catch (error) {
      console.error(`[ModelDownloader] Error cleaning up download for ${modelName}:`, error);
    }
  }

  async cancelDownload(downloadId: number): Promise<void> {
    try {
      console.log('[ModelDownloader] Attempting to cancel download:', downloadId);
      
      // Find the download entry
      let foundEntry: DownloadTaskInfo | undefined;
      let foundModelName = '';
      
      for (const [modelName, entry] of this.activeDownloads.entries()) {
        if (entry.downloadId === downloadId) {
          foundEntry = entry;
          foundModelName = modelName;
          break;
        }
      }

      if (!foundEntry) {
        console.warn('[ModelDownloader] No active download found for ID:', downloadId);
        return;
      }

      console.log('[ModelDownloader] Found task to cancel:', { modelName: foundModelName, downloadId });

      // Stop the download task using the task.stop() method
      if (foundEntry.task) {
        console.log('[ModelDownloader] Stopping download task');
        foundEntry.task.stop();
      }

      // Remove from active downloads map first
      this.activeDownloads.delete(foundModelName);

      // Delete the temporary file if it exists
      if (foundEntry.destination) {
        console.log('[ModelDownloader] Checking for temporary file:', foundEntry.destination);
        const fileInfo = await FileSystem.getInfoAsync(foundEntry.destination);
        if (fileInfo.exists) {
          console.log('[ModelDownloader] Deleting temporary file');
          await FileSystem.deleteAsync(foundEntry.destination, { idempotent: true });
        }
      }

      // Emit cancellation event
      this.emit('downloadProgress', {
        modelName: foundModelName,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'failed',
        downloadId,
        error: 'Download cancelled by user'
      });

      // Show cancellation notification based on platform
      if (Platform.OS === 'android') {
        await downloadNotificationService.cancelNotification(downloadId);
      } else {
        notificationService.showDownloadCancelledNotification(
          foundModelName,
          downloadId
        );
      }

      // Clean up the download state
      await this.cleanupDownload(foundModelName, foundEntry);

      // Update persisted downloads
      await this.persistActiveDownloads();

      console.log('[ModelDownloader] Successfully cancelled download:', downloadId);

    } catch (error) {
      console.error('[ModelDownloader] Error cancelling download:', error);
      throw error;
    }
  }

  async getStoredModels(): Promise<StoredModel[]> {
    try {
      console.log('[ModelDownloader] Getting stored models from directory:', this.baseDir);
      
      // First ensure the directory exists
      const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!dirInfo.exists) {
        console.log('[ModelDownloader] Models directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
        return [...this.externalModels]; // Return only external models if no local models
      }
      
      // Read the directory contents
      const dir = await FileSystem.readDirectoryAsync(this.baseDir);
      console.log(`[ModelDownloader] Found ${dir.length} files in models directory:`, dir);
      
      // Process each file
      let localModels: StoredModel[] = [];
      if (dir.length > 0) {
        localModels = await Promise.all(
          dir.map(async (name) => {
            const path = `${this.baseDir}/${name}`;
            const fileInfo = await FileSystem.getInfoAsync(path, { size: true });
            
            // Get file size safely
            let size = 0;
            if (fileInfo.exists) {
              size = (fileInfo as any).size || 0;
            }
            
            // Use current time as modification time
            const modified = new Date().toISOString();
            
            console.log(`[ModelDownloader] Found model: ${name}, size: ${size} bytes`);
            
            return {
              name,
              path,
              size,
              modified,
              isExternal: false
            };
          })
        );
      }
      
      // Combine local and external models
      return [...localModels, ...this.externalModels];
    } catch (error) {
      console.error('[ModelDownloader] Error getting stored models:', error);
      return [...this.externalModels]; // Return only external models on error
    }
  }

  async deleteModel(path: string): Promise<void> {
    try {
      console.log('[ModelDownloader] Deleting model:', path);
      
      // Check if it's an external model
      const externalModelIndex = this.externalModels.findIndex(model => model.path === path);
      if (externalModelIndex !== -1) {
        // Just remove from our list, don't delete the actual file
        this.externalModels.splice(externalModelIndex, 1);
        await this.saveExternalModels();
        this.emit('modelsChanged');
        console.log('[ModelDownloader] Removed external model reference:', path);
        return;
      }
      
      // Otherwise it's a local model, delete the file
      const fileInfo = await FileSystem.getInfoAsync(path);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(path);
        console.log('[ModelDownloader] Deleted model file:', path);
      } else {
        console.log('[ModelDownloader] Model file not found:', path);
      }
      
      // Emit event to notify listeners
      this.emit('modelsChanged');
    } catch (error) {
      console.error('[ModelDownloader] Error deleting model:', error);
      throw error;
    }
  }

  async checkBackgroundDownloads(): Promise<void> {
    try {
      console.log('Checking for completed background downloads...');
      
      // Get list of all files in temp directory
      const tempFiles = await FileSystem.readDirectoryAsync(this.downloadDir);
      console.log('Files in temp directory:', tempFiles);
      
      // First, check all files in temp directory regardless of active downloads
      for (const filename of tempFiles) {
        const tempPath = `${this.downloadDir}/${filename}`;
        const modelPath = `${this.baseDir}/${filename}`;
        
        // Check if file exists in temp
          const tempInfo = await FileSystem.getInfoAsync(tempPath);
          if (tempInfo.exists) {
            const tempSize = await this.getFileSize(tempPath);
            
          // If file has size > 0, consider it complete and try to move it
          if (tempSize > 0) {
              try {
              // Check if it's already in models directory
              const modelExists = (await FileSystem.getInfoAsync(modelPath)).exists;
              if (!modelExists) {
                await this.moveFile(tempPath, modelPath);
                console.log(`Moved completed download to models: ${filename}`);
                
                // Emit completion event
                const downloadId = this.nextDownloadId++;
                this.emit('downloadProgress', {
                  modelName: filename,
                  progress: 100,
                  bytesDownloaded: tempSize,
                  totalBytes: tempSize,
                  status: 'completed',
                  downloadId
                });
                
                // Show completion notification
                await this.showNotification(
                  'Download Complete',
                  `${filename} has been downloaded successfully.`,
                  { modelName: filename, action: 'download_complete' }
                );
              }
              } catch (moveError) {
              console.error(`Error moving completed file for ${filename}:`, moveError);
            }
          }
        }
      }
      
      // Then check active downloads
      for (const [modelName, downloadInfo] of this.activeDownloads.entries()) {
        console.log(`Checking download status for ${modelName}`);
        
        const modelPath = `${this.baseDir}/${modelName}`;
        const tempPath = downloadInfo.destination;
        
        // Check if model already exists in final location
        const modelExists = (await FileSystem.getInfoAsync(modelPath)).exists;
        if (modelExists) {
          console.log(`Model already exists in final location: ${modelName}`);
          const fileSize = await this.getFileSize(modelPath);
          
          // Emit completion event
            this.emit('downloadProgress', {
              modelName,
            progress: 100,
            bytesDownloaded: fileSize,
            totalBytes: fileSize,
            status: 'completed',
            downloadId: downloadInfo.downloadId
          });
          
          // Clean up download info
            await this.cleanupDownload(modelName, downloadInfo);
          continue;
        }
      }
      
      // Clean up any orphaned files in temp directory
      await this.cleanupTempDirectory();
      
      // Update stored models list
      await this.refreshStoredModels();
      
    } catch (error) {
      console.error('Error checking background downloads:', error);
    }
  }

  private async cleanupTempDirectory() {
    try {
      console.log('[ModelDownloader] Checking temp directory for cleanup...');
      
      // Check if temp directory exists
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        console.log('[ModelDownloader] Temp directory does not exist, nothing to clean up');
        return;
      }
      
      // Get list of files in temp directory
      const downloadDirContents = await FileSystem.readDirectoryAsync(this.downloadDir);
      console.log(`[ModelDownloader] Found ${downloadDirContents.length} files in temp directory:`, downloadDirContents);
      
      // Check each file
      for (const filename of downloadDirContents) {
        const sourcePath = `${this.downloadDir}/${filename}`;
        const destPath = `${this.baseDir}/${filename}`;
        
        // Check if file already exists in models directory
        const destInfo = await FileSystem.getInfoAsync(destPath);
        if (destInfo.exists) {
          console.log(`[ModelDownloader] File ${filename} already exists in models directory, removing from temp`);
          try {
            await FileSystem.deleteAsync(sourcePath, { idempotent: true });
          } catch (error) {
            console.error(`[ModelDownloader] Error deleting temp file ${filename}:`, error);
          }
          continue;
        }
        
        // Check if file is still being downloaded
        const isActiveDownload = this.activeDownloads.has(filename);
        if (isActiveDownload) {
          console.log(`[ModelDownloader] File ${filename} is still being downloaded, skipping`);
          continue;
        }
        
        // Check if file is complete (has size > 0)
        const sourceInfo = await FileSystem.getInfoAsync(sourcePath, { size: true });
        if (sourceInfo.exists && (sourceInfo as any).size > 0) {
          console.log(`[ModelDownloader] Found completed download in temp: ${filename}, moving to models directory`);
          try {
            // Make sure models directory exists
            await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true }).catch(() => {});
            
            // Move file to models directory
            await this.moveFile(sourcePath, destPath);
            console.log(`[ModelDownloader] Successfully moved ${filename} from temp to models directory`);
          } catch (error) {
            console.error(`[ModelDownloader] Error moving file ${filename} from temp to models:`, error);
          }
        } else {
          console.log(`[ModelDownloader] File ${filename} in temp directory is empty or invalid, skipping`);
        }
      }
    } catch (error) {
      console.error('[ModelDownloader] Error cleaning up temp directory:', error);
    }
  }

  async refreshStoredModels() {
    try {
      console.log('[ModelDownloader] Refreshing stored models list...');
      // Get the current list of stored models
      const storedModels = await this.getStoredModels();
      const storedModelNames = storedModels.map(model => model.name);
      
      // Check the models directory for any new files
      const modelDirContents = await FileSystem.readDirectoryAsync(this.baseDir);
      
      for (const filename of modelDirContents) {
        if (!storedModelNames.includes(filename)) {
          console.log(`[ModelDownloader] Found new model in directory: ${filename}`);
          
          const filePath = `${this.baseDir}/${filename}`;
          const fileInfo = await FileSystem.getInfoAsync(filePath, { size: true });
          
          if (fileInfo.exists) {
            // Emit a completion event for this model
            const downloadId = this.nextDownloadId++;
            this.emit('downloadProgress', {
              modelName: filename,
            progress: 100,
              bytesDownloaded: (fileInfo as any).size || 0,
              totalBytes: (fileInfo as any).size || 0,
            status: 'completed',
              downloadId
            });
            
            console.log(`[ModelDownloader] Added new model to stored models: ${filename}`);
          }
        }
      }
    } catch (error) {
      console.error('[ModelDownloader] Error refreshing stored models:', error);
    }
  }

  async processCompletedDownloads() {
    console.log('[ModelDownloader] Processing completed downloads from temp directory...');
    
    try {
      // Check if temp directory exists
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        console.log('[ModelDownloader] Temp directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.downloadDir, { intermediates: true });
        return;
      }
      
      // Get list of files in temp directory
      const files = await FileSystem.readDirectoryAsync(this.downloadDir);
      console.log(`[ModelDownloader] Found ${files.length} files in temp directory`);
      
      // Process each file
      for (const filename of files) {
        // Skip hidden files
        if (filename.startsWith('.')) continue;
        
        const tempPath = `${this.downloadDir}/${filename}`;
        const modelPath = `${this.baseDir}/${filename}`;
        
        // Check if file exists in temp directory
        const tempInfo = await FileSystem.getInfoAsync(tempPath, { size: true });
        
        if (tempInfo.exists && (tempInfo as any).size && (tempInfo as any).size > 0) {
          console.log(`[ModelDownloader] Found potentially completed download in temp: ${filename} (${(tempInfo as any).size} bytes)`);
          
          try {
            // Move the file to models directory
            console.log(`[ModelDownloader] Moving ${filename} from ${tempPath} to ${modelPath}`);
            await this.moveFile(tempPath, modelPath);
            console.log(`[ModelDownloader] Successfully moved ${filename} from temp to models directory`);
            
            // Verify the file was moved successfully
            const modelInfo = await FileSystem.getInfoAsync(modelPath, { size: true });
            if (!modelInfo.exists) {
              throw new Error(`File was not moved successfully to ${modelPath}`);
            }
            
            // Generate download ID for this model
            const downloadId = this.nextDownloadId++;
            await AsyncStorage.setItem('next_download_id', this.nextDownloadId.toString());
            
            // Emit completion event
            this.emit('downloadProgress', {
              modelName: filename,
              progress: 100,
              bytesDownloaded: (tempInfo as any).size,
              totalBytes: (tempInfo as any).size,
              status: 'completed',
              downloadId
            });
            
            // Show completion notification based on platform
            if (Platform.OS === 'android') {
              downloadNotificationService.showNotification(
                filename,
                downloadId,
                100
              );
            } else {
              notificationService.showDownloadCompletedNotification(
                filename,
                downloadId
              );
            }
          } catch (error) {
            console.error(`[ModelDownloader] Error processing completed download for ${filename}:`, error);
            
            // Show error notification based on platform
            if (Platform.OS === 'android') {
              downloadNotificationService.cancelNotification(downloadId);
            } else {
              notificationService.showDownloadFailedNotification(
                filename,
                downloadId
              );
            }
          }
        } else {
          console.log(`[ModelDownloader] File ${filename} in temp directory is empty or invalid`);
        }
      }
    } catch (error) {
      console.error('[ModelDownloader] Error processing completed downloads:', error);
    }
  }

  // Add the linkExternalModel method
  async linkExternalModel(uri: string, fileName: string): Promise<void> {
    try {
      console.log(`[ModelDownloader] Linking external model: ${fileName} from ${uri}`);
      
      // Check if file with same name already exists in models directory
      const destPath = `${this.baseDir}/${fileName}`;
      const destInfo = await FileSystem.getInfoAsync(destPath);
      if (destInfo.exists) {
        throw new Error('A model with this name already exists in the models directory');
      }

      // Check if file with same name already exists in external models
      const existingExternal = this.externalModels.find(model => model.name === fileName);
      if (existingExternal) {
        throw new Error('A model with this name already exists in external models');
      }

      // Get the file info to verify it exists and get its size
      const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
      if (!fileInfo.exists) {
        throw new Error('External file does not exist');
      }

      // For Android content:// URIs, we need to copy the file to our app's directory
      // because native modules can't directly access content:// URIs
      let finalPath = uri;
      let isExternal = true;
      
      if (Platform.OS === 'android' && uri.startsWith('content://')) {
        console.log(`[ModelDownloader] Android content URI detected, copying file to app directory`);
        
        // Create a copy in our app's models directory
        const appModelPath = `${this.baseDir}/${fileName}`;
        
        try {
          // Ensure the models directory exists
          const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
          }
          
          // Copy the file to our app's directory
          await FileSystem.copyAsync({
            from: uri,
            to: appModelPath
          });
          
          // Use the app path instead of the content URI
          finalPath = appModelPath;
          isExternal = false; // It's now a local file
          
          console.log(`[ModelDownloader] Successfully copied model to: ${appModelPath}`);
        } catch (error) {
          console.error(`[ModelDownloader] Error copying file:`, error);
          throw new Error('Failed to copy the model file to the app directory');
        }
      }

      // If we're not copying (non-Android or non-content URI), just store the reference
      if (isExternal) {
        // Add to external models list with the URI
        const newExternalModel: StoredModel = {
          name: fileName,
          path: finalPath,
          size: (fileInfo as any).size || 0,
          modified: new Date().toISOString(),
          isExternal: true
        };

        this.externalModels.push(newExternalModel);
        await this.saveExternalModels();
      }
      
      // Emit event to notify listeners
      this.emit('modelsChanged');
      
      console.log(`[ModelDownloader] Successfully linked model: ${fileName} at path: ${finalPath}`);
    } catch (error) {
      console.error(`[ModelDownloader] Error linking model: ${fileName}`, error);
      throw error;
    }
  }

  private async loadExternalModels() {
    try {
      const externalModelsJson = await AsyncStorage.getItem(this.EXTERNAL_MODELS_KEY);
      if (externalModelsJson) {
        this.externalModels = JSON.parse(externalModelsJson);
        console.log('[ModelDownloader] Loaded external models:', this.externalModels);
      }
    } catch (error) {
      console.error('[ModelDownloader] Error loading external models:', error);
      this.externalModels = [];
    }
  }

  private async saveExternalModels() {
    try {
      await AsyncStorage.setItem(this.EXTERNAL_MODELS_KEY, JSON.stringify(this.externalModels));
      console.log('[ModelDownloader] Saved external models:', this.externalModels);
    } catch (error) {
      console.error('[ModelDownloader] Error saving external models:', error);
    }
  }

  private async saveDownloadProgress(modelName: string, progress: any) {
    try {
      const savedProgress = await AsyncStorage.getItem(this.DOWNLOAD_PROGRESS_KEY);
      const progressData = savedProgress ? JSON.parse(savedProgress) : {};
      
      progressData[modelName] = progress;
      
      await AsyncStorage.setItem(this.DOWNLOAD_PROGRESS_KEY, JSON.stringify(progressData));
    } catch (error) {
      console.error('[ModelDownloader] Error saving download progress:', error);
    }
  }

  private async loadDownloadProgress() {
    try {
      const savedProgress = await AsyncStorage.getItem(this.DOWNLOAD_PROGRESS_KEY);
      if (savedProgress) {
        const progressData = JSON.parse(savedProgress);
        
        // Emit progress events for each saved download
        Object.entries(progressData).forEach(([modelName, progress]) => {
          this.emit('downloadProgress', {
            modelName,
            ...progress
          });
        });
      }
    } catch (error) {
      console.error('[ModelDownloader] Error loading download progress:', error);
    }
  }

  private async clearDownloadProgress(modelName: string) {
    try {
      const savedProgress = await AsyncStorage.getItem(this.DOWNLOAD_PROGRESS_KEY);
      if (savedProgress) {
        const progressData = JSON.parse(savedProgress);
        delete progressData[modelName];
        await AsyncStorage.setItem(this.DOWNLOAD_PROGRESS_KEY, JSON.stringify(progressData));
      }
    } catch (error) {
      console.error('[ModelDownloader] Error clearing download progress:', error);
    }
  }
}

export const modelDownloader = new ModelDownloader(); 