import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import EventEmitter from 'eventemitter3';

export interface DownloadProgress {
  [key: string]: {
    progress: number;
    bytesDownloaded: number;
    totalBytes: number;
    status: string;
    downloadId: number;
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

interface ActiveDownload {
  controller: AbortController;
  progress: {
    bytesDownloaded: number;
    totalBytes: number;
    status: string;
  };
}

class ModelDownloader extends EventEmitter {
  private readonly baseDir: string;
  private activeDownloads: Map<number, ActiveDownload> = new Map();
  private nextDownloadId = 1;

  constructor() {
    super();
    this.baseDir = `${FileSystem.documentDirectory}models`;
    this.initializeDirectory();
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

  async downloadModel(url: string, filename: string): Promise<{ downloadId: number; path: string }> {
    try {
      const downloadId = this.nextDownloadId++;
      const controller = new AbortController();
      
      this.activeDownloads.set(downloadId, {
        controller,
        progress: {
          bytesDownloaded: 0,
          totalBytes: 0,
          status: 'starting'
        }
      });

      // Start download in background
      this.startDownload(url, filename, downloadId);

      return {
        downloadId,
        path: `${this.baseDir}/${filename}`
      };
    } catch (error) {
      console.error('Download start error:', error);
      throw new Error('Failed to start download');
    }
  }

  private async startDownload(url: string, filename: string, downloadId: number) {
    try {
      const downloadResumable = FileSystem.createDownloadResumable(
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
              downloadId
            };
            
            // Update active downloads map
            const download = this.activeDownloads.get(downloadId);
            if (download) {
              download.progress = {
                bytesDownloaded: downloadProgress.totalBytesWritten,
                totalBytes: downloadProgress.totalBytesExpectedToWrite,
                status: 'downloading'
              };
            }
            
            // Emit progress event
            this.emit('downloadProgress', { modelName: filename, ...progress });
          }
        }
      );

      // Start the download
      const result = await downloadResumable.downloadAsync();
      
      if (result) {
        const finalProgress = {
          progress: 100,
          bytesDownloaded: result.totalBytesWritten || 0,
          totalBytes: result.totalBytesWritten || 0,
          status: 'completed',
          downloadId
        };
        this.emit('downloadProgress', { modelName: filename, ...finalProgress });
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
      this.emit('downloadProgress', { modelName: filename, ...failedProgress });
    } finally {
      // Clean up the active download
      this.activeDownloads.delete(downloadId);
    }
  }

  async checkDownloadStatus(downloadId: number): Promise<DownloadStatus> {
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      return {
        status: 'unknown',
        bytesDownloaded: 0,
        totalBytes: 0
      };
    }

    return {
      status: download.progress.status,
      bytesDownloaded: download.progress.bytesDownloaded,
      totalBytes: download.progress.totalBytes
    };
  }

  async cancelDownload(downloadId: number): Promise<boolean> {
    const download = this.activeDownloads.get(downloadId);
    if (download) {
      download.controller.abort();
      this.activeDownloads.delete(downloadId);
      return true;
    }
    return false;
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
}

export const modelDownloader = new ModelDownloader(); 