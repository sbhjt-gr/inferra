import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Device from 'expo-device';
import { EventEmitter } from './EventEmitter';
import { FileManager } from './FileManager';
import { StoredModelsManager } from './StoredModelsManager';
import { DownloadTaskManager } from './DownloadTaskManager';
import { downloadNotificationService } from './DownloadNotifier';
import { StoredModel } from './ModelDownloaderTypes';
import { notificationService } from './NotificationService';
import { fs as FileSystem } from './fs';
import { ModelFormat } from '../types/models';
import { mlxStorageManager } from './MLXStorageManager';

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
      if (data.modelName?.startsWith('temp_mlx_')) {
        return;
      }
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
      if (data.modelName?.startsWith('temp_mlx_')) {
        return;
      }
      notificationService.showDownloadStartedNotification(
        data.modelName,
        data.downloadId,
        data.nativeDownloadId,
      ).catch(() => {
      });
      this.emit('downloadStarted', data);
    });
    
    this.downloadTaskManager.on('downloadCompleted', async (data) => {
      if (data.modelName?.startsWith('temp_mlx_')) {
        return;
      }
      try {
        await this.syncStoredModelAfterDownload(data);
      } catch (err) {
        console.log('post_download_sync_error', err);
        try {
          await this.storedModelsManager.reloadStoredModels();
        } catch {
        }
      }
      notificationService.showDownloadCompletedNotification(
        data.modelName,
        data.downloadId,
        data.nativeDownloadId,
      ).catch(() => {
      });
      this.emit('downloadCompleted', data);
    });
    
    this.downloadTaskManager.on('downloadFailed', (data) => {
      if (data.modelName?.startsWith('temp_mlx_')) {
        return;
      }
      notificationService.showDownloadFailedNotification(
        data.modelName,
        data.downloadId,
        data.nativeDownloadId,
      ).catch(() => {
      });
      this.emit('downloadFailed', data);
    });

    this.downloadTaskManager.on('downloadCancelled', (data) => {
      if (data.modelName?.startsWith('temp_mlx_')) {
        return;
      }
      notificationService.showDownloadCancelledNotification(
        data.modelName,
        data.downloadId,
        data.nativeDownloadId,
      ).catch(() => {
      });
      this.emit('downloadCancelled', data);
    });
  }

  private async syncStoredModelAfterDownload(data: {
    modelName: string;
    finalPath?: string;
    modelFormat?: ModelFormat;
  }): Promise<void> {
    console.log('post_download_sync', data.modelName);

    if (data.modelFormat === ModelFormat.MLX) {
      await this.storedModelsManager.reloadStoredModels();
      return;
    }

    if (data.finalPath) {
      try {
        const info = await FileSystem.getInfoAsync(data.finalPath, { size: true });
        if (!info.exists) {
          console.log('post_download_file_missing', data.finalPath);
          await this.storedModelsManager.refreshStoredModels();
          return;
        }
        const size = (info as { size?: number }).size || 0;
        await this.storedModelsManager.registerModel(data.modelName, data.finalPath, size);
        return;
      } catch (err) {
        console.log('post_download_register_error', err);
      }
    }

    await this.storedModelsManager.refreshStoredModels();
  }

  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    if (nextAppState === 'active') {
      this.checkBackgroundDownloads().catch(error => {
      });
    }
  }

  private getActiveDownloadNames(): Set<string> {
    const active = this.downloadTaskManager.getActiveDownloads();
    return new Set(active.map(d => d.modelName));
  }

  private getActiveMlxPackageIds(): Set<string> {
    const active = this.downloadTaskManager.getActiveDownloads();
    const ids = new Set<string>();
    for (const d of active) {
      const name = d.modelName || '';
      const match = name.match(/^temp_mlx_(.+)_\d+_/);
      if (match?.[1]) {
        ids.add(match[1]);
      }
    }
    return ids;
  }

  private async cleanupIncompleteDownloads(): Promise<void> {
    try {
      await mlxStorageManager.cleanupIncompleteMLXModels(this.getActiveMlxPackageIds());
    } catch (error) {
      console.log('incomplete_download_cleanup_error', error);
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
      
      await this.fileManager.cleanupTempDirectory(this.getActiveDownloadNames());
      await this.cleanupIncompleteDownloads();
      
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

  async downloadMLXModel(
    modelId: string,
    files: Array<{ filename: string; downloadUrl: string; size: number }>,
    authToken?: string,
    targetDirName?: string
  ): Promise<{ downloadId: number }> {
    if (!this.isInitialized) {
      await this.initializationPromise;
    }

    try {
      if (!this.hasNotificationPermission) {
        this.hasNotificationPermission = await this.requestNotificationPermissions();
      }
      
      return await this.downloadTaskManager.downloadMLXModel(modelId, files, authToken, targetDirName);
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

  async restartDownload(modelName: string, authToken?: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initializationPromise;
    }

    console.log('restart_download', modelName);
    await this.downloadTaskManager.restartDownload(modelName, authToken);
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
      
      await this.fileManager.cleanupTempDirectory(this.getActiveDownloadNames());
      await this.cleanupIncompleteDownloads();
      
      await this.storedModelsManager.refresh();
    } catch (error) {
    }
  }

  async refreshStoredModels(): Promise<void> {
    await this.storedModelsManager.refreshStoredModels();
  }

  async reloadStoredModels(): Promise<StoredModel[]> {
    return await this.storedModelsManager.reloadStoredModels();
  }

  async linkExternalModel(uri: string, fileName: string, fileSize?: number): Promise<void> {
    await this.storedModelsManager.linkExternalModel(uri, fileName, fileSize);
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

  async getActiveDownloadsList(): Promise<Array<{ modelName: string; downloadId: number; progress: number; bytesDownloaded: number; totalBytes: number; status: string }>> {
    if (!this.isInitialized) {
      await this.initializationPromise;
    }
    return this.downloadTaskManager.getActiveDownloads().map(d => ({
      modelName: d.modelName,
      downloadId: d.downloadId,
      progress: d.progress || 0,
      bytesDownloaded: d.bytesDownloaded || 0,
      totalBytes: d.totalBytes || 0,
      status: d.status || 'downloading',
    }));
  }

  async getMLXPackageManifest(packageName: string): Promise<string[]> {
    if (!this.isInitialized) {
      await this.initializationPromise;
    }
    return this.downloadTaskManager.getMLXManifest(packageName);
  }
}

export const modelDownloader = new ModelDownloader(); 
