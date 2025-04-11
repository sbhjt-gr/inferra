import * as FileSystem from 'expo-file-system';

export type Listener = (...args: any[]) => void;

export interface ActiveDownload {
  downloadId: number;
  filename: string;
  url: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: 'queued' | 'downloading' | 'completed' | 'failed';
  timestamp: number;
  destination?: string;
  options?: any; // FileSystem.DownloadOptions
}

export interface DownloadTaskInfo {
  task: any;
  downloadId: number;
  modelName: string;
  progress?: number;
  bytesDownloaded?: number;
  totalBytes?: number;
  destination?: string;
  url?: string;
  status?: string;
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

export interface ImportProgressEvent {
  modelName: string;
  status: 'importing' | 'completed' | 'error';
  error?: string;
}

export interface DownloadProgressEvent {
  modelName: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: string;
  downloadId: number;
  error?: string;
  isPaused?: boolean;
} 