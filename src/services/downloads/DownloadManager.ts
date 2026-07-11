import { requireNativeModule, EventEmitter as ExpoEventEmitter } from 'expo-modules-core';
import { Platform } from 'react-native';
import { fs as FileSystem } from '../fs';

import {
  DownloadEventCallbacks,
  DownloadJob,
  DownloadMap,
  DownloadNativeEvent,
  DownloadProgress,
  TransferPathMap,
} from './types';

import {StoredModel} from '../ModelDownloaderTypes';
import {normalizePath, getFileName, toFileUri} from '../../utils/pathUtils';

let TransferModule: any;
try {
  TransferModule = requireNativeModule('TransferModule');
} catch (_) {
  TransferModule = null;
}

export class BackgroundDownloadService {
  private activeTransfers: DownloadMap;
  private eventCallbacks: DownloadEventCallbacks = {};
  private expoEventEmitter: InstanceType<typeof ExpoEventEmitter> | null = null;
  private eventSubscriptions: Array<{ remove(): void }> = [];
  private staleMap: Map<string, number> = new Map();
  private ignoredTransfers: Set<string> = new Set();
  private readonly staleMs = Platform.OS === 'ios' ? 60000 : 15000;

  private ignoreTransfer(modelName?: string, nativeId?: string): void {
    if (modelName) {
      this.ignoredTransfers.add(modelName);
      setTimeout(() => this.ignoredTransfers.delete(modelName), 30000);
    }
    if (nativeId) {
      this.ignoredTransfers.add(nativeId);
      setTimeout(() => this.ignoredTransfers.delete(nativeId), 30000);
    }
  }

  private isUuidLike(name: string): boolean {
    return /^[0-9A-F]{8}-[0-9A-F]{4}-/i.test(name);
  }

  private resolveModelName(
    modelName: string,
    destination?: string,
    url?: string,
  ): string {
    if (!this.isUuidLike(modelName)) {
      return modelName;
    }
    return this.extractModelName(destination, url) ?? modelName;
  }

  private findTransferByNativeId(nativeId: string): [string, DownloadJob] | undefined {
    for (const entry of this.activeTransfers.entries()) {
      if (entry[1].downloadId === nativeId) {
        return entry;
      }
    }
    return undefined;
  }

  private updateProgressFromBytes(
    transfer: DownloadJob,
    bytesWritten: number,
    totalBytes: number,
    fallbackProgress?: number,
  ): DownloadProgress {
    const currentTimestamp = Date.now();
    const timeDelta = currentTimestamp - transfer.lastUpdateTime;
    const bytesDelta = bytesWritten - transfer.lastBytesWritten;

    const computedProgress = totalBytes > 0
      ? Math.min(Math.round((bytesWritten / totalBytes) * 100), 100)
      : Math.round(fallbackProgress ?? transfer.state.progress?.progress ?? 0);

    let transferSpeedBps = transfer.state.progress?.rawSpeed ?? 0;
    if (timeDelta > 0 && bytesDelta >= 0) {
      transferSpeedBps = (bytesDelta / timeDelta) * 1000;
    }

    transfer.lastBytesWritten = bytesWritten;
    transfer.lastUpdateTime = currentTimestamp;

    return {
      bytesDownloaded: bytesWritten,
      bytesTotal: totalBytes,
      progress: computedProgress,
      speed: this.formatTransferSpeed(transferSpeedBps),
      eta: this.calculateTransferEta(bytesWritten, totalBytes, transferSpeedBps),
      rawSpeed: transferSpeedBps,
      rawEta: transferSpeedBps > 0 && totalBytes - bytesWritten > 0
        ? (totalBytes - bytesWritten) / transferSpeedBps
        : 0,
    };
  }

  constructor() {
    this.activeTransfers = new Map();

    if (TransferModule) {
      this.setupNativeEventHandlers();
    }
  }

  private setupNativeEventHandlers() {
    this.expoEventEmitter = new ExpoEventEmitter(TransferModule);

    this.eventSubscriptions.push(
      this.expoEventEmitter.addListener('onTransferProgress', (event: any) => {
      let derivedModelName = this.resolveModelName(
        event.modelName || '',
        event.destination,
        event.url,
      );

      if (this.isUuidLike(derivedModelName)) {
        derivedModelName = this.extractModelName(event.destination, event.url) ?? derivedModelName;
      }

      let transfer = derivedModelName ? this.activeTransfers.get(derivedModelName) : undefined;

      if (!transfer && event.downloadId) {
        const entry = this.findTransferByNativeId(event.downloadId);
        if (entry) {
          derivedModelName = entry[0];
          transfer = entry[1];
        }
      }

      if (!transfer && derivedModelName && !this.isUuidLike(derivedModelName)) {
        // Late native progress after cancel must not mint a fresh job + downloadStarted.
        if (this.ignoredTransfers.has(derivedModelName) || this.ignoredTransfers.has(event.downloadId)) {
          console.log('progress_ignore_cancelled', derivedModelName);
          return;
        }
        transfer = this.createTransferJobFromNativeEvent(derivedModelName, event, false) ?? undefined;
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
      const timeSinceLastUIUpdate = currentTimestamp - ((transfer as any).lastUIUpdateTime || 0);

      transfer.state.progress = this.updateProgressFromBytes(
        transfer,
        bytesWritten,
        totalBytes,
        event.progress,
      );

      const computedProgress = transfer.state.progress.progress;

      if (timeSinceLastUIUpdate >= 1000 || computedProgress === 100) {
        (transfer as any).lastUIUpdateTime = currentTimestamp;
        this.eventCallbacks.onProgress?.(derivedModelName, transfer.state.progress);
      }
    }));

    this.eventSubscriptions.push(
      this.expoEventEmitter.addListener('onTransferComplete', (event: any) => {
      console.log('native_transfer_complete', event.modelName);
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
        transfer = this.createTransferJobFromNativeEvent(derivedModelName, event) ?? undefined;
      }

      if (!transfer) {
        return;
      }

      const modelName = transfer.model.name;
      const totalBytes = event.totalBytes ?? transfer.state.progress?.bytesTotal ?? 0;

      this.staleMap.delete(modelName);
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
    }));

    this.eventSubscriptions.push(
      this.expoEventEmitter.addListener('onTransferError', (event: any) => {
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
        transfer = this.createTransferJobFromNativeEvent(derivedModelName, event, false) ?? undefined;
      }

      if (!transfer) {
        return;
      }

      transfer.state.isDownloading = false;
      transfer.state.progress = undefined;
      
      const error = new Error(event.error);
      this.eventCallbacks.onError?.(transfer.model.name, error);
      this.activeTransfers.delete(transfer.model.name);
    }));

    this.eventSubscriptions.push(
      this.expoEventEmitter.addListener('onTransferCancelled', (event: any) => {
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
        transfer = this.createTransferJobFromNativeEvent(derivedModelName, event, false) ?? undefined;
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
      transfer.state.isPaused = false;
      this.activeTransfers.delete(transfer.model.name);

      this.eventCallbacks.onCancelled?.(transfer.model.name);
    }));

    this.eventSubscriptions.push(
      this.expoEventEmitter.addListener('onTransferPaused', (event: any) => {
      console.log('native_transfer_paused', event.modelName);
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
        transfer = this.createTransferJobFromNativeEvent(derivedModelName, event, false) ?? undefined;
      }

      if (!transfer) {
        return;
      }

      if (event.downloadId) {
        transfer.downloadId = event.downloadId;
      }

      const bytesWritten = event.bytesWritten ?? transfer.state.progress?.bytesDownloaded ?? 0;
      const totalBytes = event.totalBytes ?? transfer.state.progress?.bytesTotal ?? 0;
      const progress = this.updateProgressFromBytes(transfer, bytesWritten, totalBytes, event.progress);
      progress.speed = '0 B/s';
      progress.rawSpeed = 0;
      progress.eta = 'paused';
      progress.rawEta = 0;

      transfer.state.isDownloading = false;
      transfer.state.isPaused = true;
      transfer.state.progress = progress;
      this.staleMap.delete(transfer.model.name);

      this.eventCallbacks.onPaused?.(transfer.model.name, progress);
    }));
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
    return transfer ? transfer.state.isDownloading || !!transfer.state.isPaused : false;
  }

  isTransferPaused(modelName: string): boolean {
    return !!this.activeTransfers.get(modelName)?.state.isPaused;
  }

  getTransferProgress(modelName: string): number {
    const transfer = this.activeTransfers.get(modelName);
    return transfer?.state.progress?.progress || 0;
  }

  async pauseTransfer(modelName: string, nativeTransferId?: string): Promise<void> {
    const transfer = this.activeTransfers.get(modelName);
    const transferId = transfer?.downloadId || nativeTransferId;
    if (!transferId || !TransferModule?.pauseTransfer) {
      console.log('pause_skip', modelName);
      return;
    }

    console.log('pause_transfer', modelName);
    await TransferModule.pauseTransfer(transferId);

    if (transfer) {
      transfer.state.isDownloading = false;
      transfer.state.isPaused = true;
      if (transfer.state.progress) {
        transfer.state.progress.speed = '0 B/s';
        transfer.state.progress.rawSpeed = 0;
        transfer.state.progress.eta = 'paused';
      }
      this.eventCallbacks.onPaused?.(modelName, transfer.state.progress);
    }
  }

  async resumeTransfer(
    modelName: string,
    authToken?: string | null,
    nativeTransferId?: string,
    options?: { url?: string; destination?: string },
  ): Promise<void> {
    let transfer = this.activeTransfers.get(modelName);
    let transferId = transfer?.downloadId || nativeTransferId;
    const headers = authToken ? {Authorization: `Bearer ${authToken}`} : undefined;
    const url = options?.url || transfer?.model?.path;
    const destination = options?.destination;

    console.log('resume_transfer', modelName);
    this.ignoredTransfers.delete(modelName);
    if (transferId) {
      this.ignoredTransfers.delete(transferId);
    }

    const applyLocalResume = (id: string) => {
      if (!transfer) {
        transfer = {
          model: {
            id: `${modelName}-${Date.now()}`,
            name: modelName,
            path: url || '',
            size: 0,
            modified: new Date().toISOString(),
            downloaded: false,
          },
          downloadId: id,
          state: {
            isDownloading: true,
            isPaused: false,
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
        this.activeTransfers.set(modelName, transfer);
      } else {
        transfer.downloadId = id;
        transfer.state.isDownloading = true;
        transfer.state.isPaused = false;
        if (url) {
          transfer.model.path = url;
        }
      }
      this.eventCallbacks.onStart?.(modelName, id);
    };

    const rebeginFromPartial = async () => {
      if (!url || !destination || !TransferModule?.beginTransfer) {
        throw new Error('resume_missing_url');
      }
      console.log('resume_rebegin', modelName);
      const result = await TransferModule.beginTransfer(
        url,
        destination,
        headers,
      );
      if (!result?.transferId) {
        throw new Error('resume_rebegin_failed');
      }
      transferId = result.transferId;
      applyLocalResume(result.transferId);
    };

    if (!TransferModule?.resumeTransfer) {
      await rebeginFromPartial();
      return;
    }

    if (!transferId) {
      await rebeginFromPartial();
      return;
    }

    try {
      await TransferModule.resumeTransfer(transferId, headers, url, destination);
      applyLocalResume(transferId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('resume_native_fail', modelName, message);
      if (
        message.includes('transfer_not_found') ||
        message.includes('transfer_missing_url')
      ) {
        await rebeginFromPartial();
        return;
      }
      throw error;
    }
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

    if (TransferModule) {
      return await this.startNativeTransfer(model, destinationPath, authToken);
    }

    throw new Error('TransferModule is not available');
  }

  private async startNativeTransfer(
    model: StoredModel,
    destinationPath: string,
    authToken?: string | null,
  ): Promise<string> {
    if (!TransferModule) {
      throw new Error('TransferModule is not available');
    }

    try {
      const result = await TransferModule.beginTransfer(
        model.path,
        destinationPath,
        authToken ? {Authorization: `Bearer ${authToken}`} : undefined,
      );

      if (!result || !result.transferId) {
        throw new Error('Failed to start transfer - no transfer ID returned');
      }

      this.ignoredTransfers.delete(model.name);

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

      this.eventCallbacks.onStart?.(model.name, result.transferId);

      return result.transferId;
    } catch (error) {
      throw error;
    }
  }

  async abortTransfer(modelName: string, nativeTransferId?: string): Promise<void> {
    const transfer = this.activeTransfers.get(modelName);
    this.ignoreTransfer(modelName, transfer?.downloadId || nativeTransferId);
    console.log('abort_transfer', modelName);

    if (transfer) {
      transfer.state.isCancelling = true;

      try {
        if (TransferModule) {
          await TransferModule.cancelTransfer(transfer.downloadId);
        }

        this.activeTransfers.delete(modelName);
        this.staleMap.delete(modelName);
        return;
      } catch (error) {
        this.activeTransfers.delete(modelName);
        this.staleMap.delete(modelName);
        throw error;
      }
    }

    if (!TransferModule) {
      return;
    }

    const idsToCancel = new Set<string>();
    if (nativeTransferId) {
      idsToCancel.add(nativeTransferId);
    }

    try {
      const ongoing = await TransferModule.getOngoingTransfers();
      for (const item of ongoing) {
        const name = item.modelName || this.extractModelName(item.destination, item.url);
        if (name === modelName && item.id) {
          idsToCancel.add(item.id);
        }
      }
    } catch {
    }

    for (const transferId of idsToCancel) {
      this.ignoreTransfer(modelName, transferId);
      try {
        await TransferModule.cancelTransfer(transferId);
        console.log('native_transfer_aborted', transferId);
      } catch {
      }
    }

    this.activeTransfers.delete(modelName);
    this.staleMap.delete(modelName);
  }

  private extractModelName(destination?: string, fallbackPath?: string): string | undefined {
    const source = destination || fallbackPath;
    if (!source) {
      return undefined;
    }

    let name = getFileName(normalizePath(source));
    if (name?.endsWith('.partial')) {
      name = name.slice(0, -'.partial'.length);
    }
    return name || undefined;
  }

  private createTransferJobFromNativeEvent(
    modelName: string,
    event: Partial<DownloadNativeEvent>,
    emitStarted: boolean = true,
  ): DownloadJob | null {
    const resolvedName = this.resolveModelName(
      modelName,
      event.destination,
      event.url,
    );

    if (this.isUuidLike(resolvedName)) {
      return null;
    }

    const totalBytes = event.totalBytes ?? 0;
    const bytesWritten = event.bytesWritten ?? 0;
    const speed = event.speed ?? 0;
    const progressPercent = totalBytes > 0
      ? Math.min((bytesWritten / totalBytes) * 100, 100)
      : event.progress ?? 0;

    const storedModel: StoredModel = {
      id: `${resolvedName}-${Date.now()}`,
      name: resolvedName,
      path: event.url ?? '',
      size: totalBytes,
      modified: new Date().toISOString(),
      downloaded: false,
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

    this.activeTransfers.set(resolvedName, downloadJob);

    if (emitStarted) {
      this.eventCallbacks.onStart?.(resolvedName, downloadJob.downloadId);
    }

    return downloadJob;
  }

  private pathVariants(path?: string): string[] {
    if (!path) {
      return [];
    }
    const variants = new Set<string>([path, toFileUri(path), normalizePath(path)]);
    return Array.from(variants).filter(Boolean);
  }

  private async pathHasFile(path?: string): Promise<boolean> {
    for (const candidate of this.pathVariants(path)) {
      try {
        const info = await FileSystem.getInfoAsync(candidate, { size: true });
        if (!info.exists) {
          continue;
        }
        const size = (info as { size?: number }).size ?? 0;
        if (size > 0) {
          return true;
        }
      } catch {
      }
    }
    return false;
  }

  private async waitForFileOnDisk(
    paths: string[],
    attempts = 12,
    delayMs = 500,
  ): Promise<boolean> {
    const uniquePaths = Array.from(
      new Set(paths.filter(Boolean).flatMap(p => this.pathVariants(p))),
    );

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      for (const path of uniquePaths) {
        if (await this.pathHasFile(path)) {
          return true;
        }
      }

      if (attempt < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return false;
  }

  private async tryCompleteFromDisk(
    modelName: string,
    paths?: { temp: string; final: string },
    downloadId?: string,
  ): Promise<boolean> {
    if (downloadId && TransferModule?.finalizeTransfer) {
      try {
        const result = await TransferModule.finalizeTransfer(downloadId);
        if (result?.finalized) {
          console.log('native_finalize_ok', modelName);
          return true;
        }
      } catch {
        console.log('native_finalize_err', modelName);
      }
    }

    const candidates = paths ? [paths.temp, paths.final] : [];
    for (const path of candidates) {
      if (await this.pathHasFile(path)) {
        console.log('disk_complete_ready', modelName);
        this.staleMap.delete(modelName);
        this.activeTransfers.delete(modelName);
        this.eventCallbacks.onComplete?.(modelName);
        return true;
      }
    }

    const ready = await this.waitForFileOnDisk(candidates, 8, 400);
    if (!ready) {
      return false;
    }

    console.log('disk_complete_ready', modelName);
    this.staleMap.delete(modelName);
    this.activeTransfers.delete(modelName);
    this.eventCallbacks.onComplete?.(modelName);
    return true;
  }

  async synchronizeWithActiveTransfers(
    models: StoredModel[] = [],
    destinations: TransferPathMap = new Map(),
  ): Promise<void> {
    if (!TransferModule) {
      return;
    }

    try {
      const activeTransferList = await TransferModule.getOngoingTransfers();

      const nativeIds = new Set<string>(
        activeTransferList.map((t: any) => t.id).filter(Boolean),
      );

      const nativeNames = new Set<string>(
        activeTransferList
          .map((t: any) => {
            const name = t.modelName || this.extractModelName(t.destination, t.url);
            return name ? this.resolveModelName(name, t.destination, t.url) : undefined;
          })
          .filter(Boolean),
      );

      const now = Date.now();
      for (const [modelName, job] of this.activeTransfers.entries()) {
        const linkedNative = nativeIds.has(job.downloadId) || nativeNames.has(modelName);

        if (linkedNative) {
          this.staleMap.delete(modelName);
          continue;
        }

        if (job.state.isPaused) {
          this.staleMap.delete(modelName);
          continue;
        }

        if (!job.state.isDownloading) {
          continue;
        }

        if (this.isUuidLike(modelName)) {
          console.log('orphan_transfer_drop', modelName);
          this.staleMap.delete(modelName);
          this.activeTransfers.delete(modelName);
          continue;
        }

        const progress = job.state.progress?.progress ?? 0;
        const paths = destinations.get(modelName);

        if (progress >= 95 && paths) {
          const completed = await this.tryCompleteFromDisk(modelName, paths, job.downloadId);
          if (completed) {
            continue;
          }
        }

        const first = this.staleMap.get(modelName);
        if (!first) {
          this.staleMap.set(modelName, now);
          continue;
        }

        if (now - first <= this.staleMs) {
          continue;
        }

        console.log('stale_transfer_check', modelName);
        const completed = paths
          ? await this.tryCompleteFromDisk(modelName, paths, job.downloadId)
          : false;

        if (!completed) {
          if (progress >= 95) {
            console.log('stale_grace_extend', modelName);
            this.staleMap.set(modelName, now);
          } else {
            console.log('stale_transfer_drop', modelName);
            this.staleMap.delete(modelName);
            this.activeTransfers.delete(modelName);
          }
        }
      }

      for (const transfer of activeTransferList) {
        const rawName = transfer.modelName || this.extractModelName(transfer.destination, transfer.url);
        if (!rawName) {
          continue;
        }

        const modelName = this.resolveModelName(rawName, transfer.destination, transfer.url);
        if (this.isUuidLike(modelName)) {
          continue;
        }

        let transferJob = this.activeTransfers.get(modelName);
        const isNew = !transferJob;
        const prevBytes = transferJob?.lastBytesWritten ?? -1;

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
              destination: transfer.destination,
            },
            false,
          );

          if (!transferJob) {
            continue;
          }
        }

        transferJob.downloadId = transfer.id;
        const isPaused = transfer.state === 'paused';
        transferJob.state.isDownloading = !isPaused;
        transferJob.state.isPaused = isPaused;
        transferJob.state.progress = this.updateProgressFromBytes(
          transferJob,
          transfer.bytesWritten,
          transfer.totalBytes,
          transfer.progress,
        );

        if (isPaused) {
          transferJob.state.progress.speed = '0 B/s';
          transferJob.state.progress.rawSpeed = 0;
          transferJob.state.progress.eta = 'paused';
          if (isNew) {
            this.eventCallbacks.onPaused?.(modelName, transferJob.state.progress);
          }
        } else {
          const bytesChanged = transfer.bytesWritten !== prevBytes;
          if (isNew || bytesChanged) {
            this.eventCallbacks.onProgress?.(modelName, transferJob.state.progress);
          }
        }
      }
    } catch (error) {
    }
  }

  async getOngoingNativeTransfers(): Promise<Array<{
    id: string;
    destination?: string;
    modelName?: string;
    bytesWritten?: number;
    totalBytes?: number;
    progress?: number;
    state?: string;
    url?: string;
  }>> {
    if (!TransferModule?.getOngoingTransfers) {
      return [];
    }
    try {
      const list = await TransferModule.getOngoingTransfers();
      return Array.isArray(list) ? list : [];
    } catch {
      console.log('ongoing_fetch_fail');
      return [];
    }
  }

  setEventCallbacks(callbacks: DownloadEventCallbacks): void {
    this.eventCallbacks = callbacks;
  }

  getNativeTransferId(modelName: string): string | undefined {
    return this.activeTransfers.get(modelName)?.downloadId;
  }

  getActiveTransferCount(): number {
    return this.activeTransfers.size;
  }

  shutdownService(): void {
    this.eventSubscriptions.forEach(sub => sub.remove());
    this.eventSubscriptions = [];
    
    this.activeTransfers.clear();
    this.eventCallbacks = {};
  }
}

export const backgroundDownloadService = new BackgroundDownloadService();
