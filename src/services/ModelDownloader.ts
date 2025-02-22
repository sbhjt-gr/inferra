import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import EventEmitter from 'eventemitter3';

export interface DownloadProgress {
  bytesWritten: number;
  contentLength: number;
  progress: number;
}

export interface ModelInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
}

class ModelDownloader extends EventEmitter {
  private readonly baseDir: string;
  private activeDownloads: Map<number, FileSystem.DownloadProgressData> = new Map();

  constructor() {
    super();
    this.baseDir = `${FileSystem.documentDirectory}Ragionare`;
  }

  async downloadModel(url: string, filename: string): Promise<{ downloadId: number; path: string }> {
    const downloadPath = `${this.baseDir}/${filename}`;
    
    // Create directory if it doesn't exist
    await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });

    const downloadId = Date.now();
    
    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      downloadPath,
      {},
      (downloadProgress) => {
        if (downloadProgress.totalBytesWritten && downloadProgress.totalBytesExpectedToWrite) {
          this.emit('progress', downloadId, {
            bytesWritten: downloadProgress.totalBytesWritten,
            contentLength: downloadProgress.totalBytesExpectedToWrite,
            progress: downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
          });
        }
      }
    );

    try {
      const { uri } = await downloadResumable.downloadAsync();
      return {
        downloadId,
        path: uri
      };
    } catch (error) {
      console.error('Download error:', error);
      throw error;
    }
  }

  async checkDownloadStatus(downloadId: number): Promise<{
    status: string;
    bytesDownloaded?: number;
    totalBytes?: number;
  }> {
    try {
      const info = await FileSystem.getInfoAsync(this.baseDir);
      if (!info.exists) {
        return { status: 'unknown' };
      }
      
      return {
        status: 'running',
        bytesDownloaded: info.size,
        totalBytes: info.size
      };
    } catch {
      return { status: 'failed' };
    }
  }

  async getStoredModels(): Promise<ModelInfo[]> {
    try {
      await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
      const files = await FileSystem.readDirectoryAsync(this.baseDir);
      
      const models = await Promise.all(
        files.map(async (filename) => {
          const path = `${this.baseDir}/${filename}`;
          const info = await FileSystem.getInfoAsync(path);
          return {
            name: filename,
            path,
            size: info.size || 0,
            modified: new Date().toISOString() // FileSystem doesn't provide modification date
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
      await FileSystem.deleteAsync(path);
      return true;
    } catch (error) {
      console.error('Error deleting model:', error);
      return false;
    }
  }
}

export const modelDownloader = new ModelDownloader(); 