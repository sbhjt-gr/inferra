import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import * as FileSystem from 'expo-file-system';

import {
  DownloadEventCallbacks,
  DownloadJob,
  DownloadMap,
  DownloadProgress,
} from './types';

import {StoredModel} from '../ModelDownloaderTypes';

const {TransferModule} = NativeModules;
const LOG_TAG = 'BackgroundDownloadService';

export class BackgroundDownloadService {
  private activeTransfers: DownloadMap;
  private eventCallbacks: DownloadEventCallbacks = {};
  private nativeEventEmitter: NativeEventEmitter | null = null;

  constructor() {
    this.activeTransfers = new Map();

    if (Platform.OS === 'android' && TransferModule) {
      this.setupAndroidEventHandlers();
    }
  }

  private setupAndroidEventHandlers() {
    this.nativeEventEmitter = new NativeEventEmitter(TransferModule);

    this.nativeEventEmitter.addListener('onTransferProgress', event => {
      
      const transfer = Array.from(this.activeTransfers.values()).find(
        _transfer => _transfer.downloadId === event.downloadId,
      );

      if (transfer) {
        const currentTimestamp = Date.now();
        const timeDelta = currentTimestamp - transfer.lastUpdateTime;
        const bytesDelta = event.bytesWritten - transfer.lastBytesWritten;

        let transferSpeedBps = 0;
        if (timeDelta > 0) {
          transferSpeedBps = (bytesDelta / timeDelta) * 1000;
        }

        const progressPercent = Math.min(
          Math.round((event.bytesWritten / event.totalBytes) * 100),
          100,
        );

        const speedFormatted = this.formatTransferSpeed(transferSpeedBps);
        const etaFormatted = this.calculateTransferEta(
          event.bytesWritten,
          event.totalBytes,
          transferSpeedBps,
        );

        transfer.state.progress = {
          bytesDownloaded: event.bytesWritten,
          bytesTotal: event.totalBytes,
          progress: progressPercent,
          speed: speedFormatted,
          eta: etaFormatted,
          rawSpeed: transferSpeedBps,
          rawEta: event.totalBytes - event.bytesWritten > 0 ? 
            (event.totalBytes - event.bytesWritten) / transferSpeedBps : 0,
        };

        transfer.lastBytesWritten = event.bytesWritten;
        transfer.lastUpdateTime = currentTimestamp;

        this.eventCallbacks.onProgress?.(transfer.model.name, transfer.state.progress);
      }
    });

    this.nativeEventEmitter.addListener('onTransferComplete', event => {
      const transfer = Array.from(this.activeTransfers.values()).find(
        _transfer => _transfer.downloadId === event.downloadId,
      );

      if (transfer) {
        transfer.state.isDownloading = false;
        transfer.state.progress = {
          bytesDownloaded: transfer.state.progress?.bytesTotal || 0,
          bytesTotal: transfer.state.progress?.bytesTotal || 0,
          progress: 100,
          speed: '0 B/s',
          eta: '0 sec',
          rawSpeed: 0,
          rawEta: 0,
        };
        
        this.eventCallbacks.onComplete?.(transfer.model.name);
        this.activeTransfers.delete(transfer.model.name);
        console.log(`${LOG_TAG}: transfer_removed:`, transfer.model.name);
      } else {
        console.warn(
          `${LOG_TAG}: Completion event received for non-existent transfer: ${event.downloadId}`,
        );
      }
    });

    this.nativeEventEmitter.addListener('onTransferError', event => {
      console.error(`${LOG_TAG}: Transfer error for ID: ${event.downloadId}`, event.error);
      
      const transfer = Array.from(this.activeTransfers.values()).find(
        _transfer => _transfer.downloadId === event.downloadId,
      );

      if (transfer) {
        transfer.state.isDownloading = false;
        transfer.state.progress = undefined;
        
        const error = new Error(event.error);
        this.eventCallbacks.onError?.(transfer.model.name, error);
        this.activeTransfers.delete(transfer.model.name);
      }
    });

    this.nativeEventEmitter.addListener('onTransferCancelled', event => {
      const transfer = Array.from(this.activeTransfers.values()).find(
        _transfer => _transfer.downloadId === event.downloadId,
      );

      if (transfer) {
        transfer.state.isDownloading = false;
        transfer.state.progress = undefined;
        this.activeTransfers.delete(transfer.model.name);
      }
    });
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  private formatTransferSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond === 0) return '0 B/s';
    return `${this.formatFileSize(bytesPerSecond)}/s`;
  }

  private calculateTransferEta(
    bytesTransferred: number,
    totalBytes: number,
    speedBps: number,
  ): string {
    if (speedBps === 0 || bytesTransferred >= totalBytes) {
      return '0 sec';
    }

    const remainingBytes = totalBytes - bytesTransferred;
    const etaSeconds = remainingBytes / speedBps;

    if (etaSeconds < 60) {
      return `${Math.round(etaSeconds)} sec`;
    } else if (etaSeconds < 3600) {
      return `${Math.round(etaSeconds / 60)} min`;
    } else {
      return `${Math.round(etaSeconds / 3600)} hr`;
    }
  }

  setEventHandlers(callbacks: DownloadEventCallbacks) {
    console.log(`${LOG_TAG}: event_handlers_set:`, Object.keys(callbacks));
    this.eventCallbacks = callbacks;
  }

  isTransferActive(modelName: string): boolean {
    const transfer = this.activeTransfers.get(modelName);
    return transfer ? transfer.state.isDownloading : false;
  }

  getTransferProgress(modelName: string): number {
    const transfer = this.activeTransfers.get(modelName);
    return transfer?.state.progress?.progress || 0;
  }

  async initiateTransfer(
    model: StoredModel,
    destinationPath: string,
    authToken?: string | null,
  ): Promise<void> {
    console.log(`${LOG_TAG}: transfer_starting:`, model.name);
    console.log(`${LOG_TAG}: model_details:`, JSON.stringify(model, null, 2));
    console.log(`${LOG_TAG}: destination_path:`, destinationPath);
    console.log(`${LOG_TAG}: auth_token_provided:`, !!authToken);
    console.log(`${LOG_TAG}: platform:`, Platform.OS);
    
    if (this.isTransferActive(model.name)) {
      console.log(`${LOG_TAG}: transfer_already_active:`, model.name);
      return;
    }

    const directoryPath = destinationPath.substring(
      0,
      destinationPath.lastIndexOf('/'),
    );
    try {
      console.log(`${LOG_TAG}: creating_directory:`, directoryPath);
      await FileSystem.makeDirectoryAsync(directoryPath, { intermediates: true });
      console.log(`${LOG_TAG}: directory_created_successfully:`, directoryPath);
    } catch (err) {
      console.error(`${LOG_TAG}: Failed to create directory:`, err);
      throw err;
    }

    if (Platform.OS === 'ios') {
      console.log(`${LOG_TAG}: starting_ios_transfer`);
      await this.startIOSTransfer(model, destinationPath, authToken);
    } else {
      console.log(`${LOG_TAG}: starting_android_transfer`);
      await this.startAndroidTransfer(model, destinationPath, authToken);
    }
  }

  private async startIOSTransfer(
    model: StoredModel,
    destinationPath: string,
    authToken?: string | null,
  ): Promise<void> {
    try {
      const RNFS = require('@dr.pogodin/react-native-fs');
      
      const transferJob: DownloadJob = {
        model,
        downloadId: Date.now().toString(),
        state: {
          isDownloading: true,
          progress: {
            bytesDownloaded: 0,
            bytesTotal: 0,
            progress: 0,
            speed: '0 B/s',
            eta: 'calculating',
            rawSpeed: 0,
            rawEta: 0,
          },
        },
        lastBytesWritten: 0,
        lastUpdateTime: Date.now(),
      };

      this.activeTransfers.set(model.name, transferJob);
      this.eventCallbacks.onStart?.(model.name);

      const downloadResult = RNFS.downloadFile({
        fromUrl: model.path,
        toFile: destinationPath,
        background: true,
        discretionary: false,
        progressInterval: 500,
        headers: authToken ? {Authorization: `Bearer ${authToken}`} : {},
        begin: (res: any) => {
          console.log(`${LOG_TAG}: ios_transfer_started:`, model.name);
          if (transferJob.state.progress) {
            transferJob.state.progress.bytesTotal = res.contentLength;
            this.eventCallbacks.onProgress?.(model.name, transferJob.state.progress);
          }
        },
        progress: (res: any) => {
          if (!this.activeTransfers.has(model.name)) {
            return;
          }

          const transfer = this.activeTransfers.get(model.name)!;
          const currentTimestamp = Date.now();
          const timeDelta = (currentTimestamp - transfer.lastUpdateTime) / 1000 || 1;
          const bytesDelta = res.bytesWritten - transfer.lastBytesWritten;
          const transferSpeedBps = bytesDelta / timeDelta;

          const progressPercent = res.contentLength > 0 ? 
            (res.bytesWritten / res.contentLength) * 100 : 0;
          
          const speedFormatted = this.formatTransferSpeed(transferSpeedBps);
          const etaFormatted = this.calculateTransferEta(
            res.bytesWritten,
            res.contentLength,
            transferSpeedBps,
          );

          const progress = {
            bytesDownloaded: res.bytesWritten,
            bytesTotal: res.contentLength,
            progress: progressPercent,
            speed: speedFormatted,
            eta: etaFormatted,
            rawSpeed: transferSpeedBps,
            rawEta: res.contentLength - res.bytesWritten > 0 ? 
              (res.contentLength - res.bytesWritten) / transferSpeedBps : 0,
          };

          transfer.state.progress = progress;
          transfer.lastBytesWritten = res.bytesWritten;
          transfer.lastUpdateTime = currentTimestamp;

          this.eventCallbacks.onProgress?.(model.name, progress);
        },
      });

      transferJob.downloadId = downloadResult.jobId.toString();
      transferJob.rnfsJobId = downloadResult.jobId;
      
      console.log(`${LOG_TAG}: ios_job_created:`, downloadResult.jobId);

      try {
        await downloadResult.promise;
        
        console.log(`${LOG_TAG}: ios_transfer_completed:`, model.name);
        
        const transfer = this.activeTransfers.get(model.name);
        if (transfer && transfer.state.progress) {
          transfer.state.isDownloading = false;
          transfer.state.progress.progress = 100;
          transfer.state.progress.speed = '0 B/s';
          transfer.state.progress.eta = '0 sec';
          
          this.eventCallbacks.onComplete?.(model.name);
          this.activeTransfers.delete(model.name);
        }
        
      } catch (error) {
        console.error(`${LOG_TAG}: ios_transfer_failed:`, model.name, error);
        
        const transfer = this.activeTransfers.get(model.name);
        if (transfer) {
          transfer.state.isDownloading = false;
          transfer.state.progress = undefined;
          
          this.eventCallbacks.onError?.(model.name, error as Error);
          this.activeTransfers.delete(model.name);
        }
      }

    } catch (error) {
      console.error(`${LOG_TAG}: ios_start_failed:`, error);
      this.activeTransfers.delete(model.name);
      throw error;
    }
  }

  private async startAndroidTransfer(
    model: StoredModel,
    destinationPath: string,
    authToken?: string | null,
  ): Promise<void> {
    if (!TransferModule) {
      console.error(`${LOG_TAG}: TransferModule_not_available`);
      throw new Error('TransferModule is not available on Android');
    }

    console.log(`${LOG_TAG}: TransferModule_available:`, typeof TransferModule);
    console.log(`${LOG_TAG}: TransferModule_methods:`, Object.keys(TransferModule));

    try {
      const transferOptions = {
        url: model.path,
        destination: destinationPath,
        headers: authToken ? {Authorization: `Bearer ${authToken}`} : undefined,
      };

      console.log(`${LOG_TAG}: android_transfer_starting:`, model.name);
      console.log(`${LOG_TAG}: transfer_options:`, JSON.stringify(transferOptions, null, 2));

      const result = await TransferModule.beginTransfer(
        transferOptions.url,
        transferOptions.destination,
        transferOptions.headers,
      );

      console.log(`${LOG_TAG}: beginTransfer_result:`, JSON.stringify(result, null, 2));

      if (!result || !result.transferId) {
        console.error(`${LOG_TAG}: invalid_result:`, result);
        throw new Error('Failed to start transfer - no transfer ID returned');
      }

      const transferJob: DownloadJob = {
        model,
        downloadId: result.transferId,
        state: {
          isDownloading: true,
          progress: {
            bytesDownloaded: 0,
            bytesTotal: 0,
            progress: 0,
            speed: '0 B/s',
            eta: 'calculating',
            rawSpeed: 0,
            rawEta: 0,
          },
        },
        lastBytesWritten: 0,
        lastUpdateTime: Date.now(),
      };

      this.activeTransfers.set(model.name, transferJob);
      console.log(`${LOG_TAG}: transfer_job_created:`, model.name, result.transferId);
      console.log(`${LOG_TAG}: active_transfers_count:`, this.activeTransfers.size);
      
      this.eventCallbacks.onStart?.(model.name);
      console.log(`${LOG_TAG}: onStart_callback_called:`, model.name);

      console.log(`${LOG_TAG}: android_transfer_created:`, result.transferId);
    } catch (error) {
      console.error(`${LOG_TAG}: android_start_failed:`, error);
      console.error(`${LOG_TAG}: error_details:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      throw error;
    }
  }

  async abortTransfer(modelName: string): Promise<void> {
    console.log(`${LOG_TAG}: transfer_abort_requested:`, modelName);

    const transfer = this.activeTransfers.get(modelName);
    if (!transfer) {
      console.log(`${LOG_TAG}: no_transfer_found:`, modelName);
      return;
    }

    try {
      if (Platform.OS === 'android' && TransferModule) {
        await TransferModule.cancelTransfer(transfer.downloadId);
      } else if (Platform.OS === 'ios') {
        if (transfer.rnfsJobId) {
          const RNFS = require('@dr.pogodin/react-native-fs');
          await RNFS.stopDownload(transfer.rnfsJobId);
          console.log(`${LOG_TAG}: ios_download_stopped:`, transfer.rnfsJobId);
        }
      }

      this.activeTransfers.delete(modelName);
      console.log(`${LOG_TAG}: transfer_aborted:`, modelName);
    } catch (error) {
      console.error(`${LOG_TAG}: abort_failed:`, error);
      this.activeTransfers.delete(modelName);
      throw error;
    }
  }

  async synchronizeWithActiveTransfers(models: StoredModel[]): Promise<void> {
    if (Platform.OS !== 'android' || !TransferModule) {
      return;
    }

    try {
      const activeTransferList = await TransferModule.getOngoingTransfers();
      console.log(`${LOG_TAG}: sync_transfers:`, activeTransferList.length);

      for (const transfer of activeTransferList) {
        const model = models.find(m => transfer.destination.includes(m.name));
        
        if (model && !this.activeTransfers.has(model.name)) {
          console.log(`${LOG_TAG}: restore_transfer:`, model.name);

          const transferJob: DownloadJob = {
            model,
            downloadId: transfer.id,
            state: {
              isDownloading: true,
              progress: {
                bytesDownloaded: transfer.bytesWritten,
                bytesTotal: transfer.totalBytes,
                progress: transfer.progress,
                speed: '0 B/s',
                eta: 'calculating...',
                rawSpeed: 0,
                rawEta: 0,
              },
            },
            lastBytesWritten: transfer.bytesWritten,
            lastUpdateTime: Date.now(),
          };

          this.activeTransfers.set(model.name, transferJob);
          this.eventCallbacks.onStart?.(model.name);
        }
      }
    } catch (error) {
      console.error(`${LOG_TAG}: Failed to sync with active transfers:`, error);
    }
  }

  setEventCallbacks(callbacks: DownloadEventCallbacks): void {
    console.log(`${LOG_TAG}: event_callbacks_set:`, Object.keys(callbacks));
    this.eventCallbacks = callbacks;
  }

  getActiveTransferCount(): number {
    return this.activeTransfers.size;
  }

  shutdownService(): void {
    console.log(`${LOG_TAG}: service_shutdown`);
    
    if (this.nativeEventEmitter) {
      this.nativeEventEmitter.removeAllListeners('onTransferProgress');
      this.nativeEventEmitter.removeAllListeners('onTransferComplete');
      this.nativeEventEmitter.removeAllListeners('onTransferError');
      this.nativeEventEmitter.removeAllListeners('onTransferCancelled');
    }
    
    this.activeTransfers.clear();
    this.eventCallbacks = {};
  }
}

export const backgroundDownloadService = new BackgroundDownloadService();
