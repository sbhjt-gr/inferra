import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Device from 'expo-device';
import { EventEmitter } from './EventEmitter';
import { FileManager } from './FileManager';
import { StoredModelsManager } from './StoredModelsManager';
import { DownloadTaskManager } from './DownloadTaskManager';
import { downloadNotificationService } from './DownloadNotificationService';
import { StoredModel } from './ModelDownloaderTypes';
import { notificationService } from './NotificationService';

class ModelDownloader extends EventEmitter {
  private fileManager: FileManager;
  private storedModelsManager: StoredModelsManager;
  private downloadTaskManager: DownloadTaskManager;
  private isInitialized: boolean = false;
  private isInitializing: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private hasNotificationPermission: boolean = false;

  constructor() {
    super();
    this.fileManager = new FileManager();
    this.storedModelsManager = new StoredModelsManager(this.fileManager);
    this.downloadTaskManager = new DownloadTaskManager(this.fileManager);
    
    this.setupEventForwarding();
    
    this.initializationPromise = this.initialize();
  }

  private setupEventForwarding(): void {
    this.fileManager.on('importProgress', (data) => {
      this.emit('importProgress', data);
    });

    this.storedModelsManager.on('modelsChanged', () => {
      this.emit('modelsChanged');
    });
    this.storedModelsManager.on('downloadProgress', (data) => {
      this.emit('downloadProgress', data);
    });

    // Forward DownloadTaskManager events
    this.downloadTaskManager.on('progress', (data) => {
      notificationService.updateDownloadProgressNotification(
        data.modelName,
        data.downloadId,
        Math.floor(data.progress || 0),
        data.bytesDownloaded || 0,
        data.totalBytes || 0,
        data.nativeDownloadId,
      ).catch(() => {
      });
      this.emit('downloadProgress', data);
    });
    
    this.downloadTaskManager.on('downloadStarted', (data) => {
      notificationService.showDownloadStartedNotification(
        data.modelName,
        data.downloadId,
        data.nativeDownloadId,
      ).catch(() => {
      });
      this.emit('downloadStarted', data);
    });
    
    this.downloadTaskManager.on('downloadCompleted', (data) => {
      this.storedModelsManager.refresh();
      notificationService.showDownloadCompletedNotification(
        data.modelName,
        data.downloadId,
        data.nativeDownloadId,
      ).catch(() => {
      });
      this.emit('downloadCompleted', data);
    });
    
    this.downloadTaskManager.on('downloadFailed', (data) => {
      notificationService.showDownloadFailedNotification(
        data.modelName,
        data.downloadId,
        data.nativeDownloadId,
      ).catch(() => {
      });
      this.emit('downloadFailed', data);
    });

    this.downloadTaskManager.on('downloadCancelled', (data) => {
      notificationService.showDownloadCancelledNotification(
        data.modelName,
        data.downloadId,
        data.nativeDownloadId,
      ).catch(() => {
      });
      this.emit('downloadCancelled', data);
    });
  }

  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    if (nextAppState === 'active') {
      this.checkBackgroundDownloads().catch(error => {
      });
    }
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.isInitializing) {
      await this.initializationPromise;
      return;
    }

    this.isInitializing = true;
    
    try {
      await this.fileManager.initializeDirectories();
      
      await this.storedModelsManager.initialize();

      await this.downloadTaskManager.initialize();

      await this.downloadTaskManager.ensureDownloadsAreRunning();
      
      try {
        AppState.addEventListener('change', this.handleAppStateChange);
      } catch (error) {
      }
      
      await this.downloadTaskManager.processCompletedDownloads();
      
      await this.fileManager.cleanupTempDirectory();
      
      this.isInitialized = true;
    } catch (error) {
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }



  private async requestNotificationPermissions(): Promise<boolean> {
    if (!Device.isDevice) {
      return false;
    }

    try {
      const granted = await downloadNotificationService.requestPermissions();
      this.hasNotificationPermission = granted;
      return granted;
    } catch (error) {
      return false;
    }
  }

  async ensureDownloadsAreRunning(): Promise<void> {
    await this.downloadTaskManager.ensureDownloadsAreRunning();
  }

  async downloadModel(url: string, modelName: string, authToken?: string): Promise<{ downloadId: number }> {
    if (!this.isInitialized) {
      await this.initializationPromise;
    }

    try {
      if (!this.hasNotificationPermission) {
        this.hasNotificationPermission = await this.requestNotificationPermissions();
      }
      
      return await this.downloadTaskManager.downloadModel(url, modelName, authToken);
    } catch (error) {
      throw error;
    }
  }

  async pauseDownload(downloadId: number): Promise<void> {
    await this.downloadTaskManager.pauseDownload(downloadId);
  }

  async resumeDownload(downloadId: number): Promise<void> {
    await this.downloadTaskManager.resumeDownload(downloadId);
  }

  async cancelDownload(identifier: number | string): Promise<void> {
    if (typeof identifier === 'number') {
      await this.downloadTaskManager.cancelDownload(identifier);
    } else {
      await this.downloadTaskManager.cancelDownload(identifier);
    }
  }

  async getStoredModels(): Promise<StoredModel[]> {
    if (!this.isInitialized) {
      await this.initializationPromise;
    }
    return await this.storedModelsManager.getStoredModels();
  }

  refresh(): void {
    this.storedModelsManager.refresh();
  }

  async deleteModel(path: string): Promise<void> {
    await this.storedModelsManager.deleteModel(path);
  }

  async clearAllModels(): Promise<void> {
    await this.storedModelsManager.clearAllModels();
  }

  async checkBackgroundDownloads(): Promise<void> {
    try {
      await this.downloadTaskManager.ensureDownloadsAreRunning();
      
      await this.downloadTaskManager.processCompletedDownloads();
      
      await this.fileManager.cleanupTempDirectory();
      
      await this.storedModelsManager.refreshStoredModels();
    } catch (error) {
    }
  }

  async refreshStoredModels(): Promise<void> {
    await this.storedModelsManager.refreshStoredModels();
  }

  async reloadStoredModels(): Promise<StoredModel[]> {
    return await this.storedModelsManager.reloadStoredModels();
  }

  async linkExternalModel(uri: string, fileName: string): Promise<void> {
    await this.storedModelsManager.linkExternalModel(uri, fileName);
  }

  async exportModel(modelPath: string, modelName: string): Promise<void> {
    await this.storedModelsManager.exportModel(modelPath, modelName);
  }

  async processCompletedDownloads(): Promise<void> {
    try {
      await this.downloadTaskManager.processCompletedDownloads();
      this.storedModelsManager.refresh();
    } catch (error) {
    }
  }
}

export const modelDownloader = new ModelDownloader(); 
