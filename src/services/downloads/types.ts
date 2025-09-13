import {StoredModel} from '../ModelDownloaderTypes';

export interface DownloadProgress {
  bytesDownloaded: number;
  bytesTotal: number;
  progress: number;
  speed: string;
  eta: string;
  rawSpeed: number;
  rawEta: number;
}

export interface DownloadJob {
  model: StoredModel;
  downloadId: string;
  state: {
    isDownloading: boolean;
    progress?: DownloadProgress;
  };
  lastBytesWritten: number;
  lastUpdateTime: number;
  rnfsJobId?: number;
}

export type DownloadMap = Map<string, DownloadJob>;

export interface DownloadEventCallbacks {
  onStart?: (modelId: string) => void;
  onProgress?: (modelId: string, progress: DownloadProgress) => void;
  onComplete?: (modelId: string) => void;
  onError?: (modelId: string, error: Error) => void;
}

export interface DownloadNativeEvent {
  downloadId: string;
  bytesWritten: number;
  totalBytes: number;
  speed: number;
  eta: number;
}

export interface DownloadCompleteEvent {
  downloadId: string;
}

export interface DownloadErrorEvent {
  downloadId: string;
  error: string;
}

export interface ActiveDownload {
  id: string;
  url: string;
  destination: string;
  bytesWritten: number;
  totalBytes: number;
  progress: number;
}
