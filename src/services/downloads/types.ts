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
    isCancelling?: boolean;
    isPaused?: boolean;
  };
  lastBytesWritten: number;
  lastUpdateTime: number;
  rnfsJobId?: number;
  pausedBytes?: number;
  destination: string;
  authToken?: string | null;
}

export type DownloadMap = Map<string, DownloadJob>;

export interface DownloadEventCallbacks {
  onStart?: (modelId: string, nativeDownloadId?: string) => void;
  onProgress?: (modelId: string, progress: DownloadProgress) => void;
  onComplete?: (modelId: string) => void;
  onError?: (modelId: string, error: Error) => void;
  onCancelled?: (modelId: string) => void;
  onPaused?: (modelId: string, payload: { bytesDownloaded: number; totalBytes: number }) => void;
}

export interface DownloadNativeEvent {
  downloadId: string;
  bytesWritten: number;
  totalBytes: number;
  speed: number;
  eta: number;
   progress?: number;
   modelName?: string;
   destination?: string;
   url?: string;
}

export interface DownloadCompleteEvent {
  downloadId: string;
  modelName?: string;
  destination?: string;
  url?: string;
  bytesWritten?: number;
  totalBytes?: number;
}

export interface DownloadErrorEvent {
  downloadId: string;
  error: string;
  modelName?: string;
  destination?: string;
  url?: string;
}

export interface ActiveDownload {
  id: string;
  url: string;
  destination: string;
  bytesWritten: number;
  totalBytes: number;
  progress: number;
  modelName?: string;
}
