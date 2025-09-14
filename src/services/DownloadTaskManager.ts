import {EventEmitter} from './EventEmitter';
import {backgroundDownloadService} from './downloads/DownloadManager';
import {DownloadProgressEvent, DownloadTaskInfo, StoredModel} from './ModelDownloaderTypes';
import {FileManager} from './FileManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

export class DownloadTaskManager extends EventEmitter {
  private activeDownloads: Map<string, DownloadTaskInfo> = new Map();
  private nextDownloadId: number = 1;
  private fileManager: FileManager;
  private readonly DOWNLOAD_PROGRESS_KEY = 'download_progress_state';
  private isInitialized: boolean = false;

  constructor(fileManager: FileManager) {
    super();
    this.fileManager = fileManager;
    this.setupBackgroundServiceIntegration();
  }

  private setupBackgroundServiceIntegration() {
    backgroundDownloadService.setEventCallbacks({
      onStart: (modelName: string) => {
        this.emit('downloadStarted', {
          modelName,
          downloadId: this.getDownloadIdForModel(modelName)
        });
      },
      onProgress: (modelName: string, progress) => {
        const downloadId = this.getDownloadIdForModel(modelName);
        const progressEvent: DownloadProgressEvent = {
          progress: progress.progress,
          bytesDownloaded: progress.bytesDownloaded,
          totalBytes: progress.bytesTotal,
          status: 'downloading',
          modelName,
          downloadId
        };
        
        this.emit('progress', progressEvent);
      },
      onComplete: async (modelName: string) => {
        
        try {
          const tempPath = `${this.fileManager.getDownloadDir()}/${modelName}`;
          const modelPath = `${this.fileManager.getBaseDir()}/${modelName}`;
          
          const tempInfo = await FileSystem.getInfoAsync(tempPath, { size: true });
          
          if (tempInfo.exists) {
            const tempSize = (tempInfo as any).size || 0;
            
            await this.fileManager.moveFile(tempPath, modelPath);
            
            const progressData: DownloadProgressEvent = {
              progress: 100,
              bytesDownloaded: tempSize,
              totalBytes: tempSize,
              status: 'completed',
              modelName,
              downloadId: this.getDownloadIdForModel(modelName)
            };
            
            this.emit('progress', progressData);
            this.emit('downloadCompleted', {
              modelName,
              downloadId: this.getDownloadIdForModel(modelName),
              finalPath: modelPath
            });
            
            this.activeDownloads.delete(modelName);
            await this.saveDownloadProgress();
          }
        } catch (error) {
          
          this.emit('downloadFailed', {
            modelName,
            downloadId: this.getDownloadIdForModel(modelName),
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },
      onError: (modelName: string, error: Error) => {

        this.emit('downloadFailed', {
          modelName,
          downloadId: this.getDownloadIdForModel(modelName),
          error: error.message
        });

        this.activeDownloads.delete(modelName);
        this.saveDownloadProgress();
      },
      onCancelled: (modelName: string) => {

        this.emit('downloadCancelled', {
          modelName,
          downloadId: this.getDownloadIdForModel(modelName)
        });

        this.activeDownloads.delete(modelName);
        this.saveDownloadProgress();
      }
    });
  }

  private getDownloadIdForModel(modelName: string): number {
    const existingDownload = this.activeDownloads.get(modelName);
    if (existingDownload) {
      return existingDownload.downloadId;
    }
    
    const downloadId = this.nextDownloadId++;
    this.saveNextDownloadId();
    return downloadId;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const savedId = await AsyncStorage.getItem('next_download_id');
      if (savedId) {
        this.nextDownloadId = parseInt(savedId, 10);
      }

      await this.loadDownloadProgress();
      this.isInitialized = true;
    } catch (error) {
      throw error;
    }
  }

  async startDownload(
    modelName: string,
    downloadUrl: string,
    authToken?: string
  ): Promise<number> {
    if (this.activeDownloads.has(modelName)) {
      throw new Error(`Download already in progress for model: ${modelName}`);
    }

    const downloadId = this.nextDownloadId++;
    const destinationPath = `${this.fileManager.getDownloadDir()}/${modelName}`;

    const downloadInfo: DownloadTaskInfo = {
      task: null, 
      downloadId,
      modelName,
      destination: destinationPath,
    };

    this.activeDownloads.set(modelName, downloadInfo);

    try {
      const storedModel: StoredModel = {
        name: modelName,
        path: downloadUrl,
        size: 0,
        modified: new Date().toISOString()
      };

      await backgroundDownloadService.initiateTransfer(
        storedModel,
        destinationPath,
        authToken
      );

      await this.saveDownloadProgress();
      await this.saveNextDownloadId();
      
      return downloadId;
    } catch (error) {
      this.activeDownloads.delete(modelName);
      throw error;
    }
  }

  async downloadModel(url: string, modelName: string): Promise<{ downloadId: number }> {
    const downloadId = await this.startDownload(modelName, url);
    return { downloadId };
  }

  async cancelDownload(modelName: string): Promise<void>;
  async cancelDownload(downloadId: number): Promise<void>;
  async cancelDownload(identifier: string | number): Promise<void> {
    let modelName: string;
    
    if (typeof identifier === 'number') {
      const download = Array.from(this.activeDownloads.entries()).find(([, info]) => info.downloadId === identifier);
      if (!download) {
        return;
      }
      modelName = download[0];
    } else {
      modelName = identifier;
      if (!this.activeDownloads.has(modelName)) {
        return;
      }
    }

    try {
      await backgroundDownloadService.abortTransfer(modelName);
    } catch (error) {
      throw error;
    }
  }

  async pauseDownload(downloadId: number): Promise<void> {
    const download = Array.from(this.activeDownloads.entries()).find(([, info]) => info.downloadId === downloadId);
    if (!download) {
      return;
    }
    
    const modelName = download[0];
    // Pause functionality not implemented
  }

  async resumeDownload(downloadId: number): Promise<void> {
    const download = Array.from(this.activeDownloads.entries()).find(([, info]) => info.downloadId === downloadId);
    if (!download) {
      return;
    }
    
    const modelName = download[0];
    // Resume functionality not implemented
  }

  async ensureDownloadsAreRunning(): Promise<void> {
    // not implemented
  }

  async processCompletedDownloads(): Promise<void> {
    // not implemented
  }

  isDownloading(modelName: string): boolean {
    return backgroundDownloadService.isTransferActive(modelName);
  }

  getDownloadProgress(modelName: string): number {
    return backgroundDownloadService.getTransferProgress(modelName);
  }

  getActiveDownloads(): DownloadTaskInfo[] {
    return Array.from(this.activeDownloads.values());
  }

  private async saveDownloadProgress(): Promise<void> {
    try {
      const progressState = {
        activeDownloads: Array.from(this.activeDownloads.entries()).map(([key, value]) => ({
          modelName: key,
          downloadInfo: {
            downloadId: value.downloadId,
            modelName: value.modelName,
            destination: value.destination,
          }
        }))
      };

      await AsyncStorage.setItem(
        this.DOWNLOAD_PROGRESS_KEY,
        JSON.stringify(progressState)
      );
    } catch (error) {
      // Failed to save download progress
    }
  }

  private async loadDownloadProgress(): Promise<void> {
    try {
      const savedProgress = await AsyncStorage.getItem(this.DOWNLOAD_PROGRESS_KEY);
      if (savedProgress) {
        const progressState = JSON.parse(savedProgress);
        
        for (const item of progressState.activeDownloads || []) {
          const downloadInfo: DownloadTaskInfo = {
            task: null,
            downloadId: item.downloadInfo.downloadId,
            modelName: item.downloadInfo.modelName,
            destination: item.downloadInfo.destination,
          };
          
          this.activeDownloads.set(item.modelName, downloadInfo);
        }
      }
    } catch (error) {
      // Failed to load download progress
    }
  }

  private async saveNextDownloadId(): Promise<void> {
    try {
      await AsyncStorage.setItem('next_download_id', this.nextDownloadId.toString());
    } catch (error) {
      // Failed to save next download ID
    }
  }

  async cleanup(): Promise<void> {
    backgroundDownloadService.shutdownService();
    this.activeDownloads.clear();
    this.removeAllListeners();
    this.isInitialized = false;
  }
}
