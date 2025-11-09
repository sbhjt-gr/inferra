import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import * as FileSystem from 'expo-file-system';

import {
  DownloadEventCallbacks,
  DownloadJob,
  DownloadMap,
  DownloadNativeEvent,
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
      let derivedModelName = event.modelName || this.extractModelName(event.destination, event.url);

      let transfer = derivedModelName ? this.activeTransfers.get(derivedModelName) : undefined;

      if (!transfer && event.downloadId) {
        const entry = Array.from(this.activeTransfers.entries()).find(([, job]) => job.downloadId === event.downloadId);
        if (entry) {
          derivedModelName = entry[0];
          transfer = entry[1];
        }
      }

      if (!transfer && derivedModelName) {
        transfer = this.createTransferJobFromNativeEvent(derivedModelName, event);
      }

      if (!transfer || !derivedModelName) {
        return;
      }

      if (event.downloadId) {
        transfer.downloadId = event.downloadId;
      }

      const bytesWritten = event.bytesWritten ?? transfer.state.progress?.bytesDownloaded ?? 0;
      const totalBytes = event.totalBytes ?? transfer.state.progress?.bytesTotal ?? 0;

      const currentTimestamp = Date.now();
      const timeDelta = currentTimestamp - transfer.lastUpdateTime;
      const bytesDelta = bytesWritten - transfer.lastBytesWritten;

      let transferSpeedBps = transfer.state.progress?.rawSpeed ?? 0;
      if (timeDelta > 0 && bytesDelta >= 0) {
        transferSpeedBps = (bytesDelta / timeDelta) * 1000;
      }

      const computedProgress = totalBytes > 0
        ? Math.min(Math.round((bytesWritten / totalBytes) * 100), 100)
        : Math.round(event.progress ?? transfer.state.progress?.progress ?? 0);

      const speedFormatted = this.formatTransferSpeed(transferSpeedBps);
      const etaFormatted = this.calculateTransferEta(bytesWritten, totalBytes, transferSpeedBps);
      const remainingBytes = totalBytes - bytesWritten;

      transfer.state.progress = {
        bytesDownloaded: bytesWritten,
        bytesTotal: totalBytes,
        progress: computedProgress,
        speed: speedFormatted,
        eta: etaFormatted,
        rawSpeed: transferSpeedBps,
        rawEta: transferSpeedBps > 0 && remainingBytes > 0 ? remainingBytes / transferSpeedBps : 0,
      };

      transfer.lastBytesWritten = bytesWritten;
      transfer.lastUpdateTime = currentTimestamp;

      this.eventCallbacks.onProgress?.(derivedModelName, transfer.state.progress);
    });

    this.nativeEventEmitter.addListener('onTransferComplete', event => {
      const derivedModelName = event.modelName || this.extractModelName(event.destination, event.url);

      let transfer: DownloadJob | undefined = derivedModelName
        ? this.activeTransfers.get(derivedModelName)
        : undefined;

      if (!transfer) {
        transfer = Array.from(this.activeTransfers.values()).find(
          _transfer => _transfer.downloadId === event.downloadId,
        );
      }

      if (!transfer && derivedModelName) {
        transfer = this.createTransferJobFromNativeEvent(derivedModelName, event);
      }

      if (!transfer) {
        return;
      }

      const modelName = transfer.model.name;
      const totalBytes = event.totalBytes ?? transfer.state.progress?.bytesTotal ?? 0;

      transfer.state.isDownloading = false;
      transfer.state.progress = {
        bytesDownloaded: totalBytes,
        bytesTotal: totalBytes,
        progress: 100,
        speed: '0 B/s',
        eta: '0 sec',
        rawSpeed: 0,
        rawEta: 0,
      };

      this.eventCallbacks.onComplete?.(modelName);
      this.activeTransfers.delete(modelName);
    });

    this.nativeEventEmitter.addListener('onTransferError', event => {
      const derivedModelName = event.modelName || this.extractModelName(event.destination, event.url);

      let transfer: DownloadJob | undefined = derivedModelName
        ? this.activeTransfers.get(derivedModelName)
        : undefined;

      if (!transfer) {
        transfer = Array.from(this.activeTransfers.values()).find(
          _transfer => _transfer.downloadId === event.downloadId,
        );
      }

      if (!transfer && derivedModelName) {
        transfer = this.createTransferJobFromNativeEvent(derivedModelName, event, false);
      }

      if (!transfer) {
        return;
      }

      transfer.state.isDownloading = false;
      transfer.state.progress = undefined;
      
      const error = new Error(event.error);
      this.eventCallbacks.onError?.(transfer.model.name, error);
      this.activeTransfers.delete(transfer.model.name);
    });

    this.nativeEventEmitter.addListener('onTransferCancelled', event => {
      const derivedModelName = event.modelName || this.extractModelName(event.destination, event.url);

      let transfer: DownloadJob | undefined = derivedModelName
        ? this.activeTransfers.get(derivedModelName)
        : undefined;

      if (!transfer) {
        transfer = Array.from(this.activeTransfers.values()).find(
          _transfer => _transfer.downloadId === event.downloadId,
        );
      }

      if (!transfer && derivedModelName) {
        transfer = this.createTransferJobFromNativeEvent(derivedModelName, event, false);
      }

      if (!transfer) {
        return;
      }

      const bytesWritten = event.bytesWritten ?? transfer.state.progress?.bytesDownloaded ?? 0;
      const totalBytes = event.totalBytes ?? transfer.state.progress?.bytesTotal ?? 0;

      if (totalBytes > 0) {
        const computedProgress = Math.min(Math.round((bytesWritten / totalBytes) * 100), 100);
        transfer.state.progress = {
          bytesDownloaded: bytesWritten,
          bytesTotal: totalBytes,
          progress: computedProgress,
          speed: '0 B/s',
          eta: '0 sec',
          rawSpeed: 0,
          rawEta: 0,
        };
      } else {
        transfer.state.progress = undefined;
      }

      transfer.state.isDownloading = false;
      this.activeTransfers.delete(transfer.model.name);

      this.eventCallbacks.onCancelled?.(transfer.model.name);
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
  ): Promise<string | undefined> {
    if (this.isTransferActive(model.name)) {
      return this.activeTransfers.get(model.name)?.downloadId;
    }

    const directoryPath = destinationPath.substring(
      0,
      destinationPath.lastIndexOf('/'),
    );
    try {
      await FileSystem.makeDirectoryAsync(directoryPath, { intermediates: true });
    } catch (err) {
      throw err;
    }

    if (Platform.OS === 'ios') {
      return await this.startIOSTransfer(model, destinationPath, authToken);
    }

    return await this.startAndroidTransfer(model, destinationPath, authToken);
  }

  private async startIOSTransfer(
    model: StoredModel,
    destinationPath: string,
    authToken?: string | null,
  ): Promise<string> {
    const RNFS = require('@dr.pogodin/react-native-fs');

    try {
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

      const downloadResult = RNFS.downloadFile({
        fromUrl: model.path,
        toFile: destinationPath,
        background: true,
        discretionary: false,
        progressInterval: 500,
        headers: authToken ? {Authorization: `Bearer ${authToken}`} : {},
        begin: (res: any) => {
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

          if (transfer.state.isCancelling) {
            return;
          }
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

          const progress: DownloadProgress = {
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

      const nativeDownloadId = downloadResult.jobId.toString();

      transferJob.downloadId = nativeDownloadId;
      transferJob.rnfsJobId = downloadResult.jobId;

  this.eventCallbacks.onStart?.(model.name, nativeDownloadId);

      downloadResult.promise
        .then(() => {
          const transfer = this.activeTransfers.get(model.name);
          if (transfer && transfer.state.progress) {
            transfer.state.isDownloading = false;
            transfer.state.progress.progress = 100;
            transfer.state.progress.speed = '0 B/s';
            transfer.state.progress.eta = '0 sec';

            this.eventCallbacks.onComplete?.(model.name);
            this.activeTransfers.delete(model.name);
          }
        })
        .catch((error: Error) => {
          const transfer = this.activeTransfers.get(model.name);
          const errorMessage = error?.message || '';
          const wasAborted = errorMessage.includes('aborted') || errorMessage.includes('cancelled');

          if (transfer) {
            transfer.state.isDownloading = false;
            transfer.state.progress = undefined;

            if (transfer.state.isCancelling || wasAborted) {
              this.eventCallbacks.onCancelled?.(model.name);
              this.activeTransfers.delete(model.name);
            } else {
              this.eventCallbacks.onError?.(model.name, error);
              this.activeTransfers.delete(model.name);
            }
          }
        });

      return nativeDownloadId;
    } catch (error) {
      this.activeTransfers.delete(model.name);
      throw error;
    }
  }

  private async startAndroidTransfer(
    model: StoredModel,
    destinationPath: string,
    authToken?: string | null,
  ): Promise<string> {
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
      
  this.eventCallbacks.onStart?.(model.name, result.transferId);
      console.log(`${LOG_TAG}: onStart_callback_called:`, model.name);

      console.log(`${LOG_TAG}: android_transfer_created:`, result.transferId);
      return result.transferId;
    } catch (error) {
      console.error(`${LOG_TAG}: android_start_failed:`, error);
      console.error(`${LOG_TAG}: error_details:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      throw error;
    }
  }

  async abortTransfer(modelName: string): Promise<void> {
    const transfer = this.activeTransfers.get(modelName);
    if (!transfer) {
      return;
    }

    transfer.state.isCancelling = true;

    try {
      if (Platform.OS === 'android' && TransferModule) {
        await TransferModule.cancelTransfer(transfer.downloadId);
      } else if (Platform.OS === 'ios') {
        if (transfer.rnfsJobId) {
          const RNFS = require('@dr.pogodin/react-native-fs');
          await RNFS.stopDownload(transfer.rnfsJobId);
        }
      }

      if (Platform.OS === 'ios') {
        setTimeout(() => {
          this.eventCallbacks.onCancelled?.(modelName);
        }, 100);
      }

      this.activeTransfers.delete(modelName);
    } catch (error) {
      console.error(`${LOG_TAG}: abort_failed:`, error);
      this.activeTransfers.delete(modelName);
      throw error;
    }
  }

  private extractModelName(destination?: string, fallbackPath?: string): string | undefined {
    const source = destination || fallbackPath;
    if (!source) {
      return undefined;
    }

    const sanitised = source.replace('file://', '');
    const segments = sanitised.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : undefined;
  }

  private createTransferJobFromNativeEvent(
    modelName: string,
    event: Partial<DownloadNativeEvent>,
    emitStarted: boolean = true,
  ): DownloadJob {
    const totalBytes = event.totalBytes ?? 0;
    const bytesWritten = event.bytesWritten ?? 0;
    const speed = event.speed ?? 0;
    const progressPercent = totalBytes > 0
      ? Math.min((bytesWritten / totalBytes) * 100, 100)
      : event.progress ?? 0;

    const storedModel: StoredModel = {
      name: modelName,
      path: event.url ?? '',
      size: totalBytes,
      modified: new Date().toISOString(),
    };

    const downloadJob: DownloadJob = {
      model: storedModel,
      downloadId: event.downloadId ?? Date.now().toString(),
      state: {
        isDownloading: true,
        progress: {
          bytesDownloaded: bytesWritten,
          bytesTotal: totalBytes,
          progress: progressPercent,
          speed: this.formatTransferSpeed(speed),
          eta: this.calculateTransferEta(bytesWritten, totalBytes, speed),
          rawSpeed: speed,
          rawEta: speed > 0 && totalBytes - bytesWritten > 0
            ? (totalBytes - bytesWritten) / speed
            : 0,
        },
      },
      lastBytesWritten: bytesWritten,
      lastUpdateTime: Date.now(),
    };

    this.activeTransfers.set(modelName, downloadJob);

    if (emitStarted) {
      this.eventCallbacks.onStart?.(modelName, downloadJob.downloadId);
    }

    return downloadJob;
  }

  async synchronizeWithActiveTransfers(models: StoredModel[] = []): Promise<void> {
    if (Platform.OS !== 'android' || !TransferModule) {
      return;
    }

    try {
      const activeTransferList = await TransferModule.getOngoingTransfers();
      console.log(`${LOG_TAG}: sync_transfers:`, activeTransferList.length);

      for (const transfer of activeTransferList) {
        const modelName = transfer.modelName || this.extractModelName(transfer.destination, transfer.url);
        if (!modelName) {
          continue;
        }

        let transferJob = this.activeTransfers.get(modelName);

        if (!transferJob) {
          const fallbackModel =
            models.find(m => m.name === modelName) ?? {
              name: modelName,
              path: transfer.url ?? '',
              size: transfer.totalBytes ?? 0,
              modified: new Date().toISOString(),
            };

          transferJob = this.createTransferJobFromNativeEvent(
            modelName,
            {
              downloadId: transfer.id,
              bytesWritten: transfer.bytesWritten,
              totalBytes: transfer.totalBytes,
              progress: transfer.progress,
              url: fallbackModel.path,
            },
          );
        }

        transferJob.downloadId = transfer.id;
        transferJob.lastBytesWritten = transfer.bytesWritten;
        transferJob.lastUpdateTime = Date.now();
        transferJob.state.isDownloading = true;
        transferJob.state.progress = {
          bytesDownloaded: transfer.bytesWritten,
          bytesTotal: transfer.totalBytes,
          progress: transfer.progress,
          speed: '0 B/s',
          eta: 'calculating...',
          rawSpeed: 0,
          rawEta: 0,
        };

        this.eventCallbacks.onProgress?.(modelName, transferJob.state.progress);
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
