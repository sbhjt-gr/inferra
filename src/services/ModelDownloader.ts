import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

  constructor() {
    super();
    this.baseDir = `${FileSystem.documentDirectory}models`;
    this.initializeDirectory();
    this.resumePendingDownloads();
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
        await this.startNewDownload(Number(downloadId), url, filename);
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
          
          this.downloadProgress[filename] = progress;
          
          this.emit('downloadProgress', { modelName: filename, ...progress });
        }
      }
    );

    this.downloadResumables.set(downloadId, downloadResumable);

    try {
      const result = await downloadResumable.downloadAsync();
      
      if (result) {
        await this.removePendingDownload(downloadId);
        this.downloadResumables.delete(downloadId);
        
        const finalProgress = {
          progress: 100,
          bytesDownloaded: result.totalBytesWritten || 0,
          totalBytes: result.totalBytesWritten || 0,
          status: 'completed',
          downloadId
        };
        this.emit('downloadProgress', { modelName: filename, ...finalProgress });
        this.downloadProgress[filename] = finalProgress;
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
      await this.removePendingDownload(downloadId);
      this.downloadResumables.delete(downloadId);
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

    const result = await downloadResumable.downloadAsync();
    if (result) {
      return {
        status: 'completed',
        bytesDownloaded: result.totalBytesWritten || 0,
        totalBytes: result.totalBytesWritten || 0
      };
    } else {
      return {
        status: 'unknown',
        bytesDownloaded: 0,
        totalBytes: 0
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
    if (downloadResumable) {
      try {
        const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
        const downloads = JSON.parse(pendingDownloads);
        const downloadInfo = downloads[downloadId];
        const currentProgress = this.downloadProgress[downloadInfo?.filename];
        
        if (downloadInfo && currentProgress) {
          // Just pause the download and keep the resumable
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
        }
      } catch (error) {
        console.error('Error pausing download:', error);
        throw error;
      }
    }
  }

  async resumeDownload(downloadId: number): Promise<void> {
    const downloadResumable = this.downloadResumables.get(downloadId);
    if (downloadResumable) {
      try {
        const pendingDownloads = await AsyncStorage.getItem('pendingDownloads') || '{}';
        const downloads = JSON.parse(pendingDownloads);
        const downloadInfo = downloads[downloadId];
        const currentProgress = this.downloadProgress[downloadInfo?.filename];
        
        if (downloadInfo && currentProgress) {
          // Simply resume the existing download
          await downloadResumable.resumeAsync();
          
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
        throw error;
      }
    }
  }
}

export const modelDownloader = new ModelDownloader(); 