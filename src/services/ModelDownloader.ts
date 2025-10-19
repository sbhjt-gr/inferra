import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Device from 'expo-device';
import { EventEmitter } from './EventEmitter';
import { FileManager } from './FileManager';
import { StoredModelsManager } from './StoredModelsManager';
import { DownloadTaskManager } from './DownloadTaskManager';
import { downloadNotificationService } from './DownloadNotificationService';
import { StoredModel } from './ModelDownloaderTypes';

class ModelDownloader extends EventEmitter {
  private fileManager: FileManager;
  private storedModelsManager: StoredModelsManager;
  private downloadTaskManager: DownloadTaskManager;
  private isInitialized: boolean = false;
  private hasNotificationPermission: boolean = false;

  constructor() {
    super();
    this.fileManager = new FileManager();
    this.storedModelsManager = new StoredModelsManager(this.fileManager);
    this.downloadTaskManager = new DownloadTaskManager(this.fileManager);
    
    this.setupEventForwarding();
    
    this.initialize();
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
      this.emit('downloadProgress', data);
    });
    
    this.downloadTaskManager.on('downloadStarted', (data) => {
      this.emit('downloadStarted', data);
    });
    
    this.downloadTaskManager.on('downloadCompleted', (data) => {
      this.storedModelsManager.refresh();
      this.emit('downloadCompleted', data);
    });
    
    this.downloadTaskManager.on('downloadFailed', (data) => {
      this.emit('downloadFailed', data);
    });

    this.downloadTaskManager.on('downloadCancelled', (data) => {
      this.emit('downloadCancelled', data);
    });
  }

  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    if (nextAppState === 'active') {
      this.checkBackgroundDownloads().catch(error => {
      });
    }
  }

  private async initialize() {
    try {
      await this.fileManager.initializeDirectories();
      
      await this.storedModelsManager.initialize();

      await this.downloadTaskManager.initialize();
      
      try {
        AppState.addEventListener('change', this.handleAppStateChange);
      } catch (error) {
      }
      
      await this.downloadTaskManager.processCompletedDownloads();
      
      await this.fileManager.cleanupTempDirectory();
      
      this.isInitialized = true;
    } catch (error) {
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

  async ensureDownloadsAreRunning(): Promise<void> {
    await this.downloadTaskManager.ensureDownloadsAreRunning();
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
      
      return await this.downloadTaskManager.downloadModel(url, modelName);
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

  async cancelDownload(downloadId: number): Promise<void> {
    await this.downloadTaskManager.cancelDownload(downloadId);
  }

  async getStoredModels(): Promise<StoredModel[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return await this.storedModelsManager.getStoredModels();
  }

  refresh(): void {
    this.storedModelsManager.refresh();
  }

  async deleteModel(path: string): Promise<void> {
    await this.storedModelsManager.deleteModel(path);
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
