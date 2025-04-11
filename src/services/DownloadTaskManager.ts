import RNBackgroundDownloader from '@kesha-antonov/react-native-background-downloader';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';
import { EventEmitter } from './EventEmitter';
import { FileManager } from './FileManager';
import * as FileSystem from 'expo-file-system';
import { DownloadTaskInfo, DownloadProgressEvent } from './ModelDownloaderTypes';
import { downloadNotificationService } from './DownloadNotificationService';
import { notificationService } from './NotificationService';

export class DownloadTaskManager extends EventEmitter {
  private activeDownloads: Map<string, DownloadTaskInfo> = new Map();
  private nextDownloadId: number = 1;
  private fileManager: FileManager;
  private readonly DOWNLOAD_PROGRESS_KEY = 'download_progress_state';
  private isInitialized: boolean = false;

  constructor(fileManager: FileManager) {
    super();
    this.fileManager = fileManager;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const savedId = await AsyncStorage.getItem('next_download_id');
      if (savedId) {
        this.nextDownloadId = parseInt(savedId, 10);
      }

      await this.loadDownloadProgress();

      try {
        console.log('[DownloadTaskManager] Checking for existing background downloads...');
        const existingTasks = await RNBackgroundDownloader.checkForExistingDownloads();
        console.log(`[DownloadTaskManager] Found ${existingTasks.length} existing background downloads`);
        
        for (const task of existingTasks) {
          console.log(`[DownloadTaskManager] Re-attaching to download: ${task.id}`);
          
          const modelName = task.id;
          
          const downloadInfo = {
            task,
            downloadId: this.nextDownloadId++,
            modelName,
            destination: `${this.fileManager.getDownloadDir()}/${modelName}`,
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
          } as DownloadProgressEvent);
        }
      } catch (error) {
        console.error('[DownloadTaskManager] Error checking for existing downloads:', error);
      }

      await this.checkForExistingDownloads();

      this.isInitialized = true;
    } catch (error) {
      console.error('[DownloadTaskManager] Error initializing:', error);
    }
  }

  async downloadModel(url: string, modelName: string): Promise<{ downloadId: number }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const downloadId = this.nextDownloadId++;
      await AsyncStorage.setItem('next_download_id', this.nextDownloadId.toString());
      
      const destination = `${this.fileManager.getDownloadDir()}/${modelName}`;
      
      console.log(`[DownloadTaskManager] Starting download for ${modelName} from ${url}`);
      
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
      console.error(`[DownloadTaskManager] Error starting download for ${modelName}:`, error);
      throw error;
    }
  }

  async pauseDownload(downloadId: number): Promise<void> {
    console.log(`[DownloadTaskManager] Attempting to pause download with ID ${downloadId}`);
    
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
        console.warn(`[DownloadTaskManager] No active download found with ID ${downloadId}`);
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
      } as DownloadProgressEvent);
    } catch (error) {
      console.error(`[DownloadTaskManager] Error pausing download:`, error);
    }
  }

  async resumeDownload(downloadId: number): Promise<void> {
    console.log(`[DownloadTaskManager] Attempting to resume download with ID ${downloadId}`);
    
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
        console.warn(`[DownloadTaskManager] No active download found with ID ${downloadId}`);
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
      } as DownloadProgressEvent);
    } catch (error) {
      console.error(`[DownloadTaskManager] Error resuming download:`, error);
    }
  }

  async cancelDownload(downloadId: number): Promise<void> {
    try {
      console.log('[DownloadTaskManager] Attempting to cancel download:', downloadId);
      
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
        console.warn('[DownloadTaskManager] No active download found for ID:', downloadId);
        return;
      }

      console.log('[DownloadTaskManager] Found task to cancel:', { modelName: foundModelName, downloadId });

      if (foundEntry.task) {
        console.log('[DownloadTaskManager] Stopping download task');
        foundEntry.task.stop();
      }

      this.activeDownloads.delete(foundModelName);

      if (foundEntry.destination) {
        console.log('[DownloadTaskManager] Checking for temporary file:', foundEntry.destination);
        const fileInfo = await FileSystem.getInfoAsync(foundEntry.destination);
        if (fileInfo.exists) {
          console.log('[DownloadTaskManager] Deleting temporary file');
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
      } as DownloadProgressEvent);

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

      console.log('[DownloadTaskManager] Successfully cancelled download:', downloadId);
    } catch (error) {
      console.error('[DownloadTaskManager] Error cancelling download:', error);
      throw error;
    }
  }

  async ensureDownloadsAreRunning(): Promise<void> {
    try {
      console.log('[DownloadTaskManager] Ensuring downloads are running...');
      await RNBackgroundDownloader.ensureDownloadsAreRunning();
      console.log('[DownloadTaskManager] Downloads should now be running');
    } catch (error) {
      console.error('[DownloadTaskManager] Error ensuring downloads are running:', error);
    }
  }

  async processCompletedDownloads(): Promise<void> {
    console.log('[DownloadTaskManager] Processing completed downloads from temp directory...');
    
    try {
      const tempDir = this.fileManager.getDownloadDir();
      const baseDir = this.fileManager.getBaseDir();
      
      const tempDirInfo = await FileSystem.getInfoAsync(tempDir);
      if (!tempDirInfo.exists) {
        console.log('[DownloadTaskManager] Temp directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
        return;
      }
      
      const files = await FileSystem.readDirectoryAsync(tempDir);
      console.log(`[DownloadTaskManager] Found ${files.length} files in temp directory`);
      
      for (const filename of files) {
        if (filename.startsWith('.')) continue;
        
        const tempPath = `${tempDir}/${filename}`;
        const modelPath = `${baseDir}/${filename}`;
        
        const tempInfo = await FileSystem.getInfoAsync(tempPath, { size: true });
        
        if (tempInfo.exists && (tempInfo as any).size && (tempInfo as any).size > 0) {
          console.log(`[DownloadTaskManager] Found potentially completed download in temp: ${filename} (${(tempInfo as any).size} bytes)`);
          
          try {
            console.log(`[DownloadTaskManager] Moving ${filename} from ${tempPath} to ${modelPath}`);
            await this.fileManager.moveFile(tempPath, modelPath);
            console.log(`[DownloadTaskManager] Successfully moved ${filename} from temp to models directory`);
            
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
            } as DownloadProgressEvent);
            
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
            console.error(`[DownloadTaskManager] Error processing completed download for ${filename}:`, error);
            
            if (Platform.OS === 'android') {
              downloadNotificationService.cancelNotification(this.nextDownloadId - 1);
            } else {
              notificationService.showDownloadFailedNotification(
                filename,
                this.nextDownloadId - 1
              );
            }
          }
        } else {
          console.log(`[DownloadTaskManager] File ${filename} in temp directory is empty or invalid`);
        }
      }
    } catch (error) {
      console.error('[DownloadTaskManager] Error processing completed downloads:', error);
    }
  }

  private async checkForExistingDownloads(): Promise<void> {
    try {
      const savedDownloads = await AsyncStorage.getItem('active_downloads');
      if (savedDownloads) {
        const downloads = JSON.parse(savedDownloads);
        console.log('[DownloadTaskManager] Found saved downloads:', downloads);

        for (const [modelName, downloadState] of Object.entries(downloads)) {
          const { downloadId, destination, url, progress, bytesDownloaded, totalBytes, status } = downloadState as any;
          
          const fileInfo = await FileSystem.getInfoAsync(destination);
          if (fileInfo.exists) {
            console.log(`[DownloadTaskManager] Found existing download for ${modelName}`);
            
            this.emit('downloadProgress', {
              modelName,
              progress,
              bytesDownloaded,
              totalBytes,
              status,
              downloadId
            } as DownloadProgressEvent);
          } else {
            console.log(`[DownloadTaskManager] Temp file not found for ${modelName}, cleaning up state`);
            
            this.emit('downloadProgress', {
              modelName,
              progress: 0,
              bytesDownloaded: 0,
              totalBytes: 0,
              status: 'failed',
              downloadId,
              error: 'Download file not found'
            } as DownloadProgressEvent);
            
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
      console.error('[DownloadTaskManager] Error checking for existing downloads:', error);
    }
  }

  private async persistActiveDownloads(): Promise<void> {
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
      console.log('[DownloadTaskManager] Persisted active downloads:', downloadsToSave);
    } catch (error) {
      console.error('[DownloadTaskManager] Error persisting active downloads:', error);
    }
  }

  private async cleanupDownload(modelName: string, downloadInfo: DownloadTaskInfo): Promise<void> {
    try {
      console.log(`[DownloadTaskManager] Cleaning up download for ${modelName}`);
      
      if (downloadInfo.destination) {
        const tempInfo = await FileSystem.getInfoAsync(downloadInfo.destination);
        if (tempInfo.exists) {
          console.log(`[DownloadTaskManager] Cleaning up temp file: ${downloadInfo.destination}`);
          await FileSystem.deleteAsync(downloadInfo.destination);
        }
      }

      if (Platform.OS === 'android' && downloadInfo.downloadId) {
        await downloadNotificationService.cancelNotification(downloadInfo.downloadId);
      }
      
      this.activeDownloads.delete(modelName);
      
      await this.clearDownloadProgress(modelName);
      
      await this.persistActiveDownloads();
      
      console.log(`[DownloadTaskManager] Cleanup completed for ${modelName}`);
    } catch (error) {
      console.error(`[DownloadTaskManager] Error cleaning up download for ${modelName}:`, error);
    }
  }

  private attachDownloadHandlers(task: any): void {
    let expectedTotalBytes = 0;
    const downloadInfo = this.activeDownloads.get(task.id);

    if (!downloadInfo) {
      console.error(`[DownloadTaskManager] No download info found for task ${task.id}`);
      return;
    }

    task.begin((data: any) => {
      const expectedBytes = data.expectedBytes || 0;
      console.log(`[DownloadTaskManager] Download started for ${task.id}, expected bytes: ${expectedBytes}`);
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
      } as DownloadProgressEvent);

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
      } as DownloadProgressEvent);

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
      console.log(`[DownloadTaskManager] Download completed for ${task.id}`);
      
      try {
        const tempPath = downloadInfo.destination || `${this.fileManager.getDownloadDir()}/${downloadInfo.modelName}`;
        const modelPath = `${this.fileManager.getBaseDir()}/${downloadInfo.modelName}`;
        
        const tempInfo = await FileSystem.getInfoAsync(tempPath, { size: true });
        
        if (tempInfo.exists) {
          const tempSize = (tempInfo as any).size || 0;
          
          await this.fileManager.moveFile(tempPath, modelPath);
          console.log(`[DownloadTaskManager] Moved ${downloadInfo.modelName} from temp to models directory`);
          
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
          } as DownloadProgressEvent);

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
        } else {
          console.error(`[DownloadTaskManager] Temp file not found for ${downloadInfo.modelName}`);
          
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
          } as DownloadProgressEvent);

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
        console.error(`[DownloadTaskManager] Error handling download completion for ${downloadInfo.modelName}:`, error);
        
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
        } as DownloadProgressEvent);

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
      
      console.error(`[DownloadTaskManager] Download error for ${task.id}:`, error, errorCode);
      
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
      } as DownloadProgressEvent);
      
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

  private async saveDownloadProgress(modelName: string, progress: any): Promise<void> {
    try {
      const savedProgress = await AsyncStorage.getItem(this.DOWNLOAD_PROGRESS_KEY);
      const progressData = savedProgress ? JSON.parse(savedProgress) : {};
      
      progressData[modelName] = progress;
      
      await AsyncStorage.setItem(this.DOWNLOAD_PROGRESS_KEY, JSON.stringify(progressData));
    } catch (error) {
      console.error('[DownloadTaskManager] Error saving download progress:', error);
    }
  }

  private async loadDownloadProgress(): Promise<void> {
    try {
      const savedProgress = await AsyncStorage.getItem(this.DOWNLOAD_PROGRESS_KEY);
      if (savedProgress) {
        const progressData = JSON.parse(savedProgress);
        
        Object.entries(progressData).forEach(([modelName, progress]) => {
          this.emit('downloadProgress', {
            modelName,
            ...progress
          } as DownloadProgressEvent);
        });
      }
    } catch (error) {
      console.error('[DownloadTaskManager] Error loading download progress:', error);
    }
  }

  private async clearDownloadProgress(modelName: string): Promise<void> {
    try {
      const savedProgress = await AsyncStorage.getItem(this.DOWNLOAD_PROGRESS_KEY);
      if (savedProgress) {
        const progressData = JSON.parse(savedProgress);
        delete progressData[modelName];
        await AsyncStorage.setItem(this.DOWNLOAD_PROGRESS_KEY, JSON.stringify(progressData));
      }
    } catch (error) {
      console.error('[DownloadTaskManager] Error clearing download progress:', error);
    }
  }
} 