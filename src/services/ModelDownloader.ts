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
    this.downloadDir = `${FileSystem.documentDirectory}temp`;  
    this.initialize();
  }

  private async initialize() {
    try {
      
      await this.initializeDirectory();
      
      
      const savedId = await AsyncStorage.getItem('next_download_id');
      if (savedId) {
        this.nextDownloadId = parseInt(savedId, 10);
      }

      
      await this.loadExternalModels();

      
      await this.loadDownloadProgress();

      
      AppState.addEventListener('change', this.handleAppStateChange);
      
      
      try {
        console.log('[ModelDownloader] Checking for existing background downloads...');
        
        const existingTasks = await RNBackgroundDownloader.checkForExistingDownloads();
        console.log(`[ModelDownloader] Found ${existingTasks.length} existing background downloads`);
        
        
        for (const task of existingTasks) {
          console.log(`[ModelDownloader] Re-attaching to download: ${task.id}`);
          
          
          const modelName = task.id;
          
          
          const downloadInfo = {
            task,
            downloadId: this.nextDownloadId++,
            modelName,
            destination: `${this.downloadDir}/${modelName}`,
          };
          
          
          this.activeDownloads.set(modelName, downloadInfo);
          
          
          this.attachDownloadHandlers(task);
          
          
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

      
      await this.checkForExistingDownloads();

      
      await this.processCompletedDownloads();

      this.isInitialized = true;
      
      
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
      
      
      const modelsDirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!modelsDirInfo.exists) {
        console.log('[ModelDownloader] Models directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
      } else {
        console.log('[ModelDownloader] Models directory already exists');
      }
      
      
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        console.log('[ModelDownloader] Temp directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.downloadDir, { intermediates: true });
      } else {
        console.log('[ModelDownloader] Temp directory already exists');
      }
      
      
      try {
        const modelFiles = await FileSystem.readDirectoryAsync(this.baseDir);
        console.log(`[ModelDownloader] Found ${modelFiles.length} files in models directory:`, modelFiles);
      } catch (error) {
        console.error('[ModelDownloader] Error listing models directory:', error);
      }
      
      
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
          
          
          const fileInfo = await FileSystem.getInfoAsync(destination);
          if (fileInfo.exists) {
            console.log(`[ModelDownloader] Found existing download for ${modelName}`);
            
            
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
            
            this.emit('downloadProgress', {
              modelName,
              progress: 0,
              bytesDownloaded: 0,
              totalBytes: 0,
              status: 'failed',
              downloadId,
              error: 'Download file not found'
            });
            
            
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
    
    
    
    if (nextAppState === 'inactive') {
      console.log('[ModelDownloader] App is being closed, cancelling all downloads');
      
      
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
    
    let expectedTotalBytes = 0;
    const downloadInfo = this.activeDownloads.get(task.id);

    if (!downloadInfo) {
      console.error(`[ModelDownloader] No download info found for task ${task.id}`);
      return;
    }

    
    task.begin((data: any) => {
      const expectedBytes = data.expectedBytes || 0;
      console.log(`[ModelDownloader] Download started for ${task.id}, expected bytes: ${expectedBytes}`);
      expectedTotalBytes = expectedBytes;

      
      downloadInfo.totalBytes = expectedBytes;
      
      const progressData = {
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: expectedBytes,
        status: 'downloading',
        downloadId: downloadInfo.downloadId
      };

      
      this.saveDownloadProgress(downloadInfo.modelName, progressData);
      
      
      this.emit('downloadProgress', {
        modelName: downloadInfo.modelName,
        ...progressData
      });

      
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
    
    
    task.progress((data: any) => {
      const bytesDownloaded = data.bytesDownloaded || 0;
      const bytesTotal = data.bytesTotal || expectedTotalBytes || 1;
      
      
      const progress = Math.round((bytesDownloaded / bytesTotal) * 100);
      
      
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

      
      this.saveDownloadProgress(downloadInfo.modelName, progressData);

      
      this.emit('downloadProgress', {
        modelName: downloadInfo.modelName,
        ...progressData
      });

      
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
    
    
    task.done(async () => {
      console.log(`[ModelDownloader] Download completed for ${task.id}`);
      
      try {
        const tempPath = downloadInfo.destination || `${this.downloadDir}/${downloadInfo.modelName}`;
        const modelPath = `${this.baseDir}/${downloadInfo.modelName}`;
        
        
        const tempInfo = await FileSystem.getInfoAsync(tempPath, { size: true });
        
        if (tempInfo.exists) {
          const tempSize = (tempInfo as any).size || 0;
          
          
          await this.moveFile(tempPath, modelPath);
          console.log(`[ModelDownloader] Moved ${downloadInfo.modelName} from temp to models directory`);
          
          const progressData = {
            progress: 100,
            bytesDownloaded: tempSize,
            totalBytes: tempSize,
            status: 'completed',
            downloadId: downloadInfo.downloadId
          };

          
          await this.clearDownloadProgress(downloadInfo.modelName);

          
          this.emit('downloadProgress', {
            modelName: downloadInfo.modelName,
            ...progressData
          });

          
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
          
          
          await this.cleanupDownload(downloadInfo.modelName, downloadInfo);
          
          
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

          
          await this.clearDownloadProgress(downloadInfo.modelName);

          
          this.emit('downloadProgress', {
            modelName: downloadInfo.modelName,
            ...progressData
          });

          
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

        
        await this.clearDownloadProgress(downloadInfo.modelName);

        
        this.emit('downloadProgress', {
          modelName: downloadInfo.modelName,
          ...progressData
        });

        
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

      
      this.clearDownloadProgress(downloadInfo.modelName);

      
      this.emit('downloadProgress', {
        modelName: downloadInfo.modelName,
        ...progressData
      });
      
      
      if (Platform.OS === 'android') {
        downloadNotificationService.cancelNotification(downloadInfo.downloadId);
      } else {
        notificationService.showDownloadFailedNotification(
          downloadInfo.modelName,
          downloadInfo.downloadId
        );
      }
      
      
      this.cleanupDownload(downloadInfo.modelName, downloadInfo);
    });
  }

  private async moveFile(sourcePath: string, destPath: string): Promise<void> {
    console.log(`[ModelDownloader] Moving file from ${sourcePath} to ${destPath}`);
    
    try {
      const modelName = destPath.split('/').pop() || 'model';
      console.log(`[ModelDownloader] Emitting importProgress event for ${modelName} (importing)`);
      
      
      this.emit('importProgress', {
        modelName,
        status: 'importing'
      });

      
      const sourceInfo = await FileSystem.getInfoAsync(sourcePath);
      if (!sourceInfo.exists) {
        throw new Error(`Source file does not exist: ${sourcePath}`);
      }
      
      
      const destDir = destPath.substring(0, destPath.lastIndexOf('/'));
      const destDirInfo = await FileSystem.getInfoAsync(destDir);
      if (!destDirInfo.exists) {
        console.log(`[ModelDownloader] Creating destination directory: ${destDir}`);
        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      }
      
      
      const destInfo = await FileSystem.getInfoAsync(destPath);
      if (destInfo.exists) {
        console.log(`[ModelDownloader] Destination file already exists, deleting it: ${destPath}`);
        await FileSystem.deleteAsync(destPath, { idempotent: true });
      }
      
      
      console.log(`[ModelDownloader] Executing moveAsync from ${sourcePath} to ${destPath}`);
      await FileSystem.moveAsync({
        from: sourcePath,
        to: destPath
      });
      
      
      const newDestInfo = await FileSystem.getInfoAsync(destPath);
      if (!newDestInfo.exists) {
        throw new Error(`File was not moved successfully to ${destPath}`);
      }

      console.log(`[ModelDownloader] Emitting importProgress event for ${modelName} (completed)`);
      
      this.emit('importProgress', {
        modelName,
        status: 'completed'
      });
      
      console.log(`[ModelDownloader] File successfully moved to ${destPath}`);
    } catch (error) {
      const modelName = destPath.split('/').pop() || 'model';
      console.log(`[ModelDownloader] Emitting importProgress event for ${modelName} (error)`);
      
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
      
      
      const statInfo = await FileSystem.getInfoAsync(path, { size: true });
      
      
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
      
      if (!this.hasNotificationPermission) {
        if (Platform.OS === 'android') {
          
          this.hasNotificationPermission = await downloadNotificationService.requestPermissions();
        } else {
          
          this.hasNotificationPermission = await this.requestNotificationPermissions();
        }
      }
      
      
      const downloadId = this.nextDownloadId++;
      await AsyncStorage.setItem('next_download_id', this.nextDownloadId.toString());
      
      
      const destination = `${this.downloadDir}/${modelName}`;
      
      console.log(`[ModelDownloader] Starting download for ${modelName} from ${url}`);
      
      
      const task = RNBackgroundDownloader.download({
        id: modelName,
        url,
        destination,
        headers: {
          'Accept-Ranges': 'bytes'
        }
      } as any);
      
      
      const downloadInfo = {
        task,
        downloadId,
        modelName,
        destination,
        url
      };

      
      this.activeDownloads.set(modelName, downloadInfo);
      
      
      this.attachDownloadHandlers(task);

      
      await this.persistActiveDownloads();

      
      Alert.alert(
        'Download Started',
        'Please do not remove the app from your recents screen while downloading. Doing so will interrupt the download.',
        [{ text: 'OK', style: 'default' }]
      );
      
      
      return { downloadId };
    } catch (error) {
      console.error(`[ModelDownloader] Error starting download for ${modelName}:`, error);
      throw error;
    }
  }

  async pauseDownload(downloadId: number): Promise<void> {
    console.log(`[ModelDownloader] Attempting to pause download with ID ${downloadId}`);
    
    try {
      
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
      
      
      if (Platform.OS === 'ios' && typeof foundEntry.task.pause === 'function') {
        
        foundEntry.task.pause();
        
        
        if (Platform.OS === 'ios') {
          notificationService.showDownloadPausedNotification(
            foundModelName,
            downloadId
          );
        }
      } else if (Platform.OS === 'ios') {
        
        if (Platform.OS === 'ios') {
          notificationService.showDownloadPauseUnavailableNotification(
            foundModelName,
            downloadId
          );
        }
      }
      
      
      
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
      
      
      if (Platform.OS === 'ios' && typeof foundEntry.task.resume === 'function') {
        
        foundEntry.task.resume();
        
        
        if (Platform.OS === 'ios') {
          notificationService.showDownloadResumedNotification(
            foundModelName,
            downloadId
          );
        }
      } else if (Platform.OS === 'ios') {
        
        if (Platform.OS === 'ios') {
          notificationService.showDownloadResumeUnavailableNotification(
            foundModelName,
            downloadId
          );
        }
      }
      
      
      
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
      
      
      if (downloadInfo.destination) {
        const tempInfo = await FileSystem.getInfoAsync(downloadInfo.destination);
        if (tempInfo.exists) {
          console.log(`[ModelDownloader] Cleaning up temp file: ${downloadInfo.destination}`);
          await FileSystem.deleteAsync(downloadInfo.destination);
        }
      }

      
      if (Platform.OS === 'android' && downloadInfo.downloadId) {
        await downloadNotificationService.cancelNotification(downloadInfo.downloadId);
      }
      
      
      this.activeDownloads.delete(modelName);
      
      
      await this.clearDownloadProgress(modelName);
      
      
      await this.persistActiveDownloads();
      
      console.log(`[ModelDownloader] Cleanup completed for ${modelName}`);
    } catch (error) {
      console.error(`[ModelDownloader] Error cleaning up download for ${modelName}:`, error);
    }
  }

  async cancelDownload(downloadId: number): Promise<void> {
    try {
      console.log('[ModelDownloader] Attempting to cancel download:', downloadId);
      
      
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

      
      if (foundEntry.task) {
        console.log('[ModelDownloader] Stopping download task');
        foundEntry.task.stop();
      }

      
      this.activeDownloads.delete(foundModelName);

      
      if (foundEntry.destination) {
        console.log('[ModelDownloader] Checking for temporary file:', foundEntry.destination);
        const fileInfo = await FileSystem.getInfoAsync(foundEntry.destination);
        if (fileInfo.exists) {
          console.log('[ModelDownloader] Deleting temporary file');
          await FileSystem.deleteAsync(foundEntry.destination, { idempotent: true });
        }
      }

      
      this.emit('downloadProgress', {
        modelName: foundModelName,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'failed',
        downloadId,
        error: 'Download cancelled by user'
      });

      
      if (Platform.OS === 'android') {
        await downloadNotificationService.cancelNotification(downloadId);
      } else {
        notificationService.showDownloadCancelledNotification(
          foundModelName,
          downloadId
        );
      }

      
      await this.cleanupDownload(foundModelName, foundEntry);

      
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
      
      
      const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!dirInfo.exists) {
        console.log('[ModelDownloader] Models directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
        return [...this.externalModels]; 
      }
      
      
      const dir = await FileSystem.readDirectoryAsync(this.baseDir);
      console.log(`[ModelDownloader] Found ${dir.length} files in models directory:`, dir);
      
      
      let localModels: StoredModel[] = [];
      if (dir.length > 0) {
        localModels = await Promise.all(
          dir.map(async (name) => {
            const path = `${this.baseDir}/${name}`;
            const fileInfo = await FileSystem.getInfoAsync(path, { size: true });
            
            
            let size = 0;
            if (fileInfo.exists) {
              size = (fileInfo as any).size || 0;
            }
            
            
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
      
      
      return [...localModels, ...this.externalModels];
    } catch (error) {
      console.error('[ModelDownloader] Error getting stored models:', error);
      return [...this.externalModels]; 
    }
  }

  async deleteModel(path: string): Promise<void> {
    try {
      console.log('[ModelDownloader] Deleting model:', path);
      
      
      const externalModelIndex = this.externalModels.findIndex(model => model.path === path);
      if (externalModelIndex !== -1) {
        
        this.externalModels.splice(externalModelIndex, 1);
        await this.saveExternalModels();
        this.emit('modelsChanged');
        console.log('[ModelDownloader] Removed external model reference:', path);
        return;
      }
      
      
      const fileInfo = await FileSystem.getInfoAsync(path);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(path);
        console.log('[ModelDownloader] Deleted model file:', path);
      } else {
        console.log('[ModelDownloader] Model file not found:', path);
      }
      
      
      this.emit('modelsChanged');
    } catch (error) {
      console.error('[ModelDownloader] Error deleting model:', error);
      throw error;
    }
  }

  async checkBackgroundDownloads(): Promise<void> {
    try {
      console.log('Checking for completed background downloads...');
      
      
      const tempFiles = await FileSystem.readDirectoryAsync(this.downloadDir);
      console.log('Files in temp directory:', tempFiles);
      
      
      for (const filename of tempFiles) {
        const tempPath = `${this.downloadDir}/${filename}`;
        const modelPath = `${this.baseDir}/${filename}`;
        
        
          const tempInfo = await FileSystem.getInfoAsync(tempPath);
          if (tempInfo.exists) {
            const tempSize = await this.getFileSize(tempPath);
            
          
          if (tempSize > 0) {
              try {
              
              const modelExists = (await FileSystem.getInfoAsync(modelPath)).exists;
              if (!modelExists) {
                await this.moveFile(tempPath, modelPath);
                console.log(`Moved completed download to models: ${filename}`);
                
                
                const downloadId = this.nextDownloadId++;
                this.emit('downloadProgress', {
                  modelName: filename,
                  progress: 100,
                  bytesDownloaded: tempSize,
                  totalBytes: tempSize,
                  status: 'completed',
                  downloadId
                });
                
                
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
      
      
      for (const [modelName, downloadInfo] of this.activeDownloads.entries()) {
        console.log(`Checking download status for ${modelName}`);
        
        const modelPath = `${this.baseDir}/${modelName}`;
        const tempPath = downloadInfo.destination;
        
        
        const modelExists = (await FileSystem.getInfoAsync(modelPath)).exists;
        if (modelExists) {
          console.log(`Model already exists in final location: ${modelName}`);
          const fileSize = await this.getFileSize(modelPath);
          
          
            this.emit('downloadProgress', {
              modelName,
            progress: 100,
            bytesDownloaded: fileSize,
            totalBytes: fileSize,
            status: 'completed',
            downloadId: downloadInfo.downloadId
          });
          
          
            await this.cleanupDownload(modelName, downloadInfo);
          continue;
        }
      }
      
      
      await this.cleanupTempDirectory();
      
      
      await this.refreshStoredModels();
      
    } catch (error) {
      console.error('Error checking background downloads:', error);
    }
  }

  private async cleanupTempDirectory() {
    try {
      console.log('[ModelDownloader] Checking temp directory for cleanup...');
      
      
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        console.log('[ModelDownloader] Temp directory does not exist, nothing to clean up');
        return;
      }
      
      
      const downloadDirContents = await FileSystem.readDirectoryAsync(this.downloadDir);
      console.log(`[ModelDownloader] Found ${downloadDirContents.length} files in temp directory:`, downloadDirContents);
      
      
      for (const filename of downloadDirContents) {
        const sourcePath = `${this.downloadDir}/${filename}`;
        const destPath = `${this.baseDir}/${filename}`;
        
        
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
        
        
        const isActiveDownload = this.activeDownloads.has(filename);
        if (isActiveDownload) {
          console.log(`[ModelDownloader] File ${filename} is still being downloaded, skipping`);
          continue;
        }
        
        
        const sourceInfo = await FileSystem.getInfoAsync(sourcePath, { size: true });
        if (sourceInfo.exists && (sourceInfo as any).size > 0) {
          console.log(`[ModelDownloader] Found completed download in temp: ${filename}, moving to models directory`);
          try {
            
            await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true }).catch(() => {});
            
            
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
      
      const storedModels = await this.getStoredModels();
      const storedModelNames = storedModels.map(model => model.name);
      
      
      const modelDirContents = await FileSystem.readDirectoryAsync(this.baseDir);
      
      for (const filename of modelDirContents) {
        if (!storedModelNames.includes(filename)) {
          console.log(`[ModelDownloader] Found new model in directory: ${filename}`);
          
          const filePath = `${this.baseDir}/${filename}`;
          const fileInfo = await FileSystem.getInfoAsync(filePath, { size: true });
          
          if (fileInfo.exists) {
            
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
      
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        console.log('[ModelDownloader] Temp directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.downloadDir, { intermediates: true });
        return;
      }
      
      
      const files = await FileSystem.readDirectoryAsync(this.downloadDir);
      console.log(`[ModelDownloader] Found ${files.length} files in temp directory`);
      
      
      for (const filename of files) {
        
        if (filename.startsWith('.')) continue;
        
        const tempPath = `${this.downloadDir}/${filename}`;
        const modelPath = `${this.baseDir}/${filename}`;
        
        
        const tempInfo = await FileSystem.getInfoAsync(tempPath, { size: true });
        
        if (tempInfo.exists && (tempInfo as any).size && (tempInfo as any).size > 0) {
          console.log(`[ModelDownloader] Found potentially completed download in temp: ${filename} (${(tempInfo as any).size} bytes)`);
          
          try {
            
            console.log(`[ModelDownloader] Moving ${filename} from ${tempPath} to ${modelPath}`);
            await this.moveFile(tempPath, modelPath);
            console.log(`[ModelDownloader] Successfully moved ${filename} from temp to models directory`);
            
            
            const modelInfo = await FileSystem.getInfoAsync(modelPath, { size: true });
            if (!modelInfo.exists) {
              throw new Error(`File was not moved successfully to ${modelPath}`);
            }
            
            
            const downloadId = this.nextDownloadId++;
            await AsyncStorage.setItem('next_download_id', this.nextDownloadId.toString());
            
            
            this.emit('downloadProgress', {
              modelName: filename,
              progress: 100,
              bytesDownloaded: (tempInfo as any).size,
              totalBytes: (tempInfo as any).size,
              status: 'completed',
              downloadId
            });
            
            
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

  
  async linkExternalModel(uri: string, fileName: string): Promise<void> {
    try {
      console.log(`[ModelDownloader] Linking external model: ${fileName} from ${uri}`);
      
      
      const destPath = `${this.baseDir}/${fileName}`;
      const destInfo = await FileSystem.getInfoAsync(destPath);
      if (destInfo.exists) {
        throw new Error('A model with this name already exists in the models directory');
      }

      
      const existingExternal = this.externalModels.find(model => model.name === fileName);
      if (existingExternal) {
        throw new Error('A model with this name already exists in external models');
      }

      
      const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
      if (!fileInfo.exists) {
        throw new Error('External file does not exist');
      }

      
      
      let finalPath = uri;
      let isExternal = true;
      
      if (Platform.OS === 'android' && uri.startsWith('content://')) {
        console.log(`[ModelDownloader] Android content URI detected, copying file to app directory`);
        
        
        const appModelPath = `${this.baseDir}/${fileName}`;
        
        try {
          
          const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
          }
          
          
          await FileSystem.copyAsync({
            from: uri,
            to: appModelPath
          });
          
          
          finalPath = appModelPath;
          isExternal = false; 
          
          console.log(`[ModelDownloader] Successfully copied model to: ${appModelPath}`);
        } catch (error) {
          console.error(`[ModelDownloader] Error copying file:`, error);
          throw new Error('Failed to copy the model file to the app directory');
        }
      }

      
      if (isExternal) {
        
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