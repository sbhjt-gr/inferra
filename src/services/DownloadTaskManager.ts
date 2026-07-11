import {EventEmitter} from './EventEmitter';
import {backgroundDownloadService} from './downloads/DownloadManager';
import {DownloadProgressEvent, DownloadTaskInfo, StoredModel} from './ModelDownloaderTypes';
import {FileManager} from './FileManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fs as FileSystem } from './fs';
import {hasEnoughSpace} from '../utils/storageUtils';
import { mlxStorageManager } from './MLXStorageManager';
import { ModelFormat } from '../types/models';
import { notificationService } from './NotificationService';
import { toFileUri, normalizePath } from '../utils/pathUtils';

export class DownloadTaskManager extends EventEmitter {
  private activeDownloads: Map<string, DownloadTaskInfo> = new Map();
  private nextDownloadId: number = 1;
  private fileManager: FileManager;
  private tempNameMap: Map<string, string> = new Map();
  private startedDisplayNames: Set<string> = new Set();
  private readonly DOWNLOAD_PROGRESS_KEY = 'download_progress_state';
  private readonly MLX_PACKAGE_MANIFEST_KEY = 'mlx_package_manifest';
  private isInitialized: boolean = false;
  private manualCancellationSet: Set<string> = new Set<string>();
  private completingSet: Set<string> = new Set<string>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private savePending: boolean = false;

  constructor(fileManager: FileManager) {
    super();
    this.fileManager = fileManager;
    this.setupBackgroundServiceIntegration();
  }

  private setupBackgroundServiceIntegration() {
    backgroundDownloadService.setEventCallbacks({
      onStart: (modelName: string, nativeDownloadId?: string) => {
        const displayName = this.tempNameMap.get(modelName) ?? modelName;
        if (this.startedDisplayNames.has(displayName)) {
          return;
        }
        this.startedDisplayNames.add(displayName);

        const downloadInfo = this.activeDownloads.get(modelName);
        if (nativeDownloadId && downloadInfo) {
          downloadInfo.nativeDownloadId = nativeDownloadId;
          void this.saveDownloadProgress();
        }

        const resolvedNativeId = nativeDownloadId ?? downloadInfo?.nativeDownloadId;
        this.emit('downloadStarted', {
          modelName: displayName,
          downloadId: this.getDownloadIdForModel(modelName),
          nativeDownloadId: resolvedNativeId,
        });
      },
      onProgress: (modelName: string, progress) => {
        const displayName = this.tempNameMap.get(modelName) ?? modelName;
        const downloadId = this.getDownloadIdForModel(modelName);
        const downloadInfo = this.activeDownloads.get(modelName);
        const progressEvent: DownloadProgressEvent = {
          progress: progress.progress,
          bytesDownloaded: progress.bytesDownloaded,
          totalBytes: progress.bytesTotal,
          status: 'downloading',
          modelName: displayName,
          downloadId,
          nativeDownloadId: downloadInfo?.nativeDownloadId,
          speed: progress.speed,
          rawSpeed: progress.rawSpeed,
          isPaused: false,
        };
        if (downloadInfo) {
          downloadInfo.progress = progress.progress;
          downloadInfo.bytesDownloaded = progress.bytesDownloaded;
          downloadInfo.totalBytes = progress.bytesTotal;
          downloadInfo.status = 'downloading';
          downloadInfo.isPaused = false;

          const prevPersisted = downloadInfo.lastPersistedProgress ?? -1;
          if (progress.progress - prevPersisted >= 10 || progress.progress === 100) {
            downloadInfo.lastPersistedProgress = progress.progress;
            void this.saveDownloadProgress();
          }
        }

        this.emit('progress', progressEvent);
      },
      onComplete: async (modelName: string) => {
        if (this.completingSet.has(modelName)) {
          console.log('complete_skip_dup', modelName);
          return;
        }
        this.completingSet.add(modelName);

        const displayName = this.tempNameMap.get(modelName) ?? modelName;
        const downloadInfo = this.activeDownloads.get(modelName);
        const modelPath = `${this.fileManager.getBaseDir()}/${modelName}`;

        try {
          if (downloadInfo) {
            downloadInfo.status = 'completed';
            downloadInfo.progress = 100;
          }

          const resolved = await this.waitForDownloadFile(modelName, downloadInfo);
          if (!resolved) {
            throw new Error(`file_not_found_after_download: ${modelName}`);
          }

          let finalSize = resolved.size;
          if (!resolved.isFinal) {
            await this.fileManager.moveFile(resolved.path, modelPath);
            const movedInfo = await FileSystem.getInfoAsync(modelPath, { size: true });
            finalSize = (movedInfo as { size?: number }).size || finalSize;
          }

          const progressData: DownloadProgressEvent = {
            progress: 100,
            bytesDownloaded: finalSize,
            totalBytes: finalSize,
            status: 'completed',
            modelName: displayName,
            downloadId: this.getDownloadIdForModel(modelName),
            nativeDownloadId: downloadInfo?.nativeDownloadId,
          };

          this.emit('progress', progressData);
          this.emit('downloadCompleted', {
            modelName,
            displayName,
            downloadId: this.getDownloadIdForModel(modelName),
            finalPath: modelPath,
            nativeDownloadId: downloadInfo?.nativeDownloadId,
          });

          this.activeDownloads.delete(modelName);
          this.tempNameMap.delete(modelName);
          this.startedDisplayNames.delete(displayName);
          await this.saveDownloadProgress();
        } catch (error) {
          console.log('complete_error', modelName, error instanceof Error ? error.message : 'unknown');

          if (downloadInfo) {
            await this.purgeDownloadFiles(modelName, downloadInfo);
          }

          this.activeDownloads.delete(modelName);
          this.tempNameMap.delete(modelName);
          this.startedDisplayNames.delete(displayName);
          await this.saveDownloadProgress();

          this.emit('downloadFailed', {
            modelName,
            displayName,
            downloadId: this.getDownloadIdForModel(modelName),
            error: error instanceof Error ? error.message : 'Unknown error',
            nativeDownloadId: downloadInfo?.nativeDownloadId,
          });
        } finally {
          this.completingSet.delete(modelName);
        }
      },
      onError: (modelName: string, error: Error) => {
        const displayName = this.tempNameMap.get(modelName) ?? modelName;
        const downloadInfo = this.activeDownloads.get(modelName);
        if (downloadInfo) {
          downloadInfo.status = 'failed';
        }

        console.log('download_error_keep_partial', modelName);

        this.emit('downloadFailed', {
          modelName: modelName,
          downloadId: this.getDownloadIdForModel(modelName),
          error: error.message,
          nativeDownloadId: downloadInfo?.nativeDownloadId,
        });

        this.activeDownloads.delete(modelName);
        this.tempNameMap.delete(modelName);
        this.startedDisplayNames.delete(displayName);
        this.saveDownloadProgress();
      },
      onCancelled: (modelName: string) => {
        if (this.manualCancellationSet.has(modelName)) {
          this.manualCancellationSet.delete(modelName);
          return;
        }
        const displayName = this.tempNameMap.get(modelName) ?? modelName;
        const downloadInfo = this.activeDownloads.get(modelName);
        if (downloadInfo) {
          downloadInfo.status = 'cancelled';
          if (downloadInfo.destination) {
            void this.fileManager.deleteFile(downloadInfo.destination).catch(() => {
            });
            void this.fileManager.deleteFile(`${downloadInfo.destination}.partial`).catch(() => {
            });
          }
        }
        this.emit('downloadCancelled', {
          modelName: displayName,
          downloadId: this.getDownloadIdForModel(modelName),
          nativeDownloadId: downloadInfo?.nativeDownloadId,
        });

        this.activeDownloads.delete(modelName);
        this.tempNameMap.delete(modelName);
        this.startedDisplayNames.delete(displayName);
        this.saveDownloadProgress();
      },
      onPaused: (modelName: string, progress) => {
        console.log('download_paused', modelName);
        const displayName = this.tempNameMap.get(modelName) ?? modelName;
        const downloadInfo = this.activeDownloads.get(modelName);
        if (downloadInfo) {
          downloadInfo.status = 'paused';
          if (progress) {
            downloadInfo.progress = progress.progress;
            downloadInfo.bytesDownloaded = progress.bytesDownloaded;
            downloadInfo.totalBytes = progress.bytesTotal;
          }
        }
        const progressEvent: DownloadProgressEvent = {
          progress: progress?.progress ?? downloadInfo?.progress ?? 0,
          bytesDownloaded: progress?.bytesDownloaded ?? downloadInfo?.bytesDownloaded ?? 0,
          totalBytes: progress?.bytesTotal ?? downloadInfo?.totalBytes ?? 0,
          status: 'paused',
          modelName: displayName,
          downloadId: this.getDownloadIdForModel(modelName),
          nativeDownloadId: downloadInfo?.nativeDownloadId,
          isPaused: true,
          speed: '0 B/s',
          rawSpeed: 0,
        };
        this.emit('progress', progressEvent);
        void this.saveDownloadProgress();
      },
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
      await this.ensureDownloadsAreRunning();
      this.isInitialized = true;
    } catch (error) {
      throw error;
    }
  }

  async startDownload(
    modelName: string,
    downloadUrl: string,
    authToken?: string,
    estimatedSize?: number
  ): Promise<number> {
    if (this.activeDownloads.has(modelName)) {
      throw new Error(`Download already in progress for model: ${modelName}`);
    }

    if (estimatedSize && estimatedSize > 0) {
      const enough = await hasEnoughSpace(estimatedSize);
      if (!enough) {
        throw new Error('Insufficient storage space');
      }
    }

    const downloadId = this.nextDownloadId++;
    const destinationPath = `${this.fileManager.getDownloadDir()}/${modelName}`;

    const downloadInfo: DownloadTaskInfo = {
      task: null,
      downloadId,
      modelName,
      destination: destinationPath,
      url: downloadUrl,
      status: 'downloading',
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      lastPersistedProgress: 0,
    };

    this.activeDownloads.set(modelName, downloadInfo);

    try {
      const storedModel: StoredModel = {
        id: `${modelName}-${Date.now()}`,
        name: modelName,
        path: downloadUrl,
        size: 0,
        modified: new Date().toISOString(),
        downloaded: false,
      };

      const nativeTransferId = await backgroundDownloadService.initiateTransfer(
        storedModel,
        destinationPath,
        authToken
      );

      if (nativeTransferId) {
        downloadInfo.nativeDownloadId = nativeTransferId;
      }

      await this.saveDownloadProgress();
      await this.saveNextDownloadId();
      
      return downloadId;
    } catch (error) {
      this.activeDownloads.delete(modelName);
      throw error;
    }
  }

  async downloadModel(url: string, modelName: string, authToken?: string): Promise<{ downloadId: number }> {
    const downloadId = await this.startDownload(modelName, url, authToken);
    return { downloadId };
  }

  async cancelDownload(modelName: string): Promise<void>;
  async cancelDownload(downloadId: number): Promise<void>;
  async cancelDownload(identifier: string | number): Promise<void> {
    const internalNames: string[] =
      typeof identifier === 'number'
        ? Array.from(this.activeDownloads.entries())
            .filter(([, info]) => info.downloadId === identifier)
            .map(([name]) => name)
        : (() => {
            const exact = this.activeDownloads.has(identifier) ? [identifier] : [];
            const mapped = Array.from(this.activeDownloads.keys()).filter(
              key => this.tempNameMap.get(key) === identifier
            );
            const merged = Array.from(new Set([...exact, ...mapped]));
            return merged;
          })();

    if (internalNames.length === 0) {
      return;
    }

    const failures: unknown[] = [];
    const cleanupModelIds = new Set<string>();

    for (const internalName of internalNames) {
      const downloadInfo = this.activeDownloads.get(internalName);
      if (!downloadInfo) {
        continue;
      }

      const displayName = this.tempNameMap.get(internalName) ?? internalName;
      const mappedPackageName = this.tempNameMap.get(internalName);
      if (mappedPackageName) {
        cleanupModelIds.add(mappedPackageName);
      }

      this.manualCancellationSet.add(internalName);

      try {
        await backgroundDownloadService.abortTransfer(internalName, downloadInfo.nativeDownloadId);
      } catch (error) {
        failures.push(error);
      } finally {
        if (this.activeDownloads.has(internalName)) {
          downloadInfo.status = 'cancelled';
          await this.purgeDownloadFiles(internalName, downloadInfo);

          this.activeDownloads.delete(internalName);
          this.tempNameMap.delete(internalName);

          setTimeout(() => {
            this.manualCancellationSet.delete(internalName);
          }, 30000);

          this.emit('downloadCancelled', {
            modelName: displayName,
            downloadId: downloadInfo.downloadId,
            nativeDownloadId: downloadInfo.nativeDownloadId,
          });
        }
      }
    }

    await this.saveDownloadProgress();

    for (const modelId of cleanupModelIds) {
      try {
        await mlxStorageManager.cleanupFailedMLXDownload(modelId);
      } catch {
      }
    }

    if (typeof identifier === 'string') {
      const hasRemainingAlias = Array.from(this.activeDownloads.keys()).some(
        key => (this.tempNameMap.get(key) ?? key) === identifier
      );
      if (!hasRemainingAlias) {
        this.startedDisplayNames.delete(identifier);
      }
    }

    if (failures.length > 0) {
      throw failures[0] as Error;
    }
  }

  private resolveInternalNames(identifier: string): string[] {
    const exact = this.activeDownloads.has(identifier) ? [identifier] : [];
    const mapped = Array.from(this.activeDownloads.keys()).filter(
      key => this.tempNameMap.get(key) === identifier
    );
    return Array.from(new Set([...exact, ...mapped]));
  }

  private async stopNativeTransfer(internalName: string, nativeDownloadId?: string): Promise<void> {
    console.log('stop_native_transfer', internalName);
    this.manualCancellationSet.add(internalName);

    try {
      await backgroundDownloadService.abortTransfer(internalName, nativeDownloadId);
    } catch {
    }
  }

  private async purgeDownloadFiles(internalName: string, downloadInfo: DownloadTaskInfo): Promise<void> {
    const bases = [
      downloadInfo.destination,
      `${this.fileManager.getDownloadDir()}/${internalName}`,
      `${this.fileManager.getBaseDir()}/${internalName}`,
    ].filter(Boolean) as string[];

    const paths = bases.flatMap(path => [path, `${path}.partial`]);

    for (const path of paths) {
      try {
        await this.fileManager.deleteFile(path);
        console.log('purge_download_path', path);
      } catch {
      }
    }
  }

  private async cleanupPackageTempResidue(packageName: string): Promise<void> {
    const prefix = `temp_mlx_${packageName}_`;

    try {
      const tempDir = this.fileManager.getDownloadDir();
      const dirInfo = await FileSystem.getInfoAsync(tempDir);
      if (!dirInfo.exists) {
        return;
      }

      const contents = await FileSystem.readDirectoryAsync(tempDir);
      for (const filename of contents) {
        if (!filename.startsWith(prefix)) {
          continue;
        }

        try {
          await this.fileManager.deleteFile(`${tempDir}/${filename}`);
          await this.fileManager.deleteFile(`${tempDir}/${filename}.partial`);
          await this.fileManager.deleteFile(`${this.fileManager.getBaseDir()}/${filename}`);
          await this.fileManager.deleteFile(`${this.fileManager.getBaseDir()}/${filename}.partial`);
          console.log('package_temp_purge', filename);
        } catch {
        }
      }
    } catch {
    }
  }

  async restartDownload(identifier: string, authToken?: string): Promise<void> {
    const internalNames = this.resolveInternalNames(identifier);
    if (internalNames.length === 0) {
      throw new Error('download_not_found');
    }

    const isMlxPackage = internalNames.some(
      name => name.startsWith('temp_mlx_') || this.tempNameMap.has(name)
    );
    if (isMlxPackage) {
      await this.cleanupPackageTempResidue(identifier);
    }

    const failures: unknown[] = [];
    const snapshots: Array<{ internalName: string; url: string; downloadId: number }> = [];

    for (const internalName of internalNames) {
      const downloadInfo = this.activeDownloads.get(internalName);
      if (!downloadInfo?.url) {
        failures.push(new Error('download_url_missing'));
        continue;
      }

      const displayName = this.tempNameMap.get(internalName) ?? internalName;
      console.log('restart_cleanup', displayName, internalName);

      await this.stopNativeTransfer(internalName, downloadInfo.nativeDownloadId);
      await this.purgeDownloadFiles(internalName, downloadInfo);

      try {
        await notificationService.cancelDownloadNotification(
          downloadInfo.downloadId,
          downloadInfo.nativeDownloadId,
        );
      } catch {
      }

      snapshots.push({
        internalName,
        url: downloadInfo.url,
        downloadId: downloadInfo.downloadId,
      });

      this.activeDownloads.delete(internalName);
      this.startedDisplayNames.delete(displayName);

      setTimeout(() => {
        this.manualCancellationSet.delete(internalName);
      }, 30000);
    }

    await this.saveDownloadProgress();

    for (const snap of snapshots) {
      try {
        await this.startDownload(snap.internalName, snap.url, authToken);
        const newInfo = this.activeDownloads.get(snap.internalName);
        if (newInfo) {
          newInfo.downloadId = snap.downloadId;
        }

        const resolvedDisplayName = this.tempNameMap.get(snap.internalName) ?? snap.internalName;
        this.emit('downloadStarted', {
          modelName: resolvedDisplayName,
          downloadId: snap.downloadId,
          nativeDownloadId: newInfo?.nativeDownloadId,
        });
      } catch (error) {
        failures.push(error);
      }
    }

    await this.saveDownloadProgress();

    if (failures.length > 0) {
      throw failures[0] as Error;
    }
  }

  async pauseDownload(downloadId: number): Promise<void> {
    const download = Array.from(this.activeDownloads.entries()).find(([, info]) => info.downloadId === downloadId);
    if (!download) {
      console.log('pause_missing', downloadId);
      return;
    }

    const [modelName, info] = download;
    if (info.status === 'paused') {
      console.log('pause_already', modelName);
      return;
    }

    console.log('pause_download', modelName);
    await backgroundDownloadService.pauseTransfer(modelName, info.nativeDownloadId);
    info.status = 'paused';
    await this.saveDownloadProgress();

    const displayName = this.tempNameMap.get(modelName) ?? modelName;
    this.emit('progress', {
      progress: info.progress ?? 0,
      bytesDownloaded: info.bytesDownloaded ?? 0,
      totalBytes: info.totalBytes ?? 0,
      status: 'paused',
      modelName: displayName,
      downloadId: info.downloadId,
      nativeDownloadId: info.nativeDownloadId,
      isPaused: true,
      speed: '0 B/s',
      rawSpeed: 0,
    });
  }

  async resumeDownload(downloadId: number, authToken?: string): Promise<void> {
    const download = Array.from(this.activeDownloads.entries()).find(([, info]) => info.downloadId === downloadId);
    if (!download) {
      console.log('resume_missing', downloadId);
      return;
    }

    const [modelName, info] = download;
    if (info.status !== 'paused') {
      console.log('resume_not_paused', modelName);
    }

    console.log('resume_download', modelName);
    await backgroundDownloadService.resumeTransfer(modelName, authToken, info.nativeDownloadId);
    info.status = 'downloading';
    await this.saveDownloadProgress();

    const displayName = this.tempNameMap.get(modelName) ?? modelName;
    this.emit('progress', {
      progress: info.progress ?? 0,
      bytesDownloaded: info.bytesDownloaded ?? 0,
      totalBytes: info.totalBytes ?? 0,
      status: 'downloading',
      modelName: displayName,
      downloadId: info.downloadId,
      nativeDownloadId: info.nativeDownloadId,
      isPaused: false,
      speed: '0 B/s',
      rawSpeed: 0,
    });
  }

  private pathVariants(path: string): string[] {
    return Array.from(new Set([path, toFileUri(path), normalizePath(path)])).filter(Boolean);
  }

  private async resolveDownloadFile(
    modelName: string,
    downloadInfo?: DownloadTaskInfo,
  ): Promise<{ path: string; size: number; isFinal: boolean } | null> {
    const baseDir = this.fileManager.getBaseDir();
    const rawPaths = [
      downloadInfo?.destination,
      `${this.fileManager.getDownloadDir()}/${modelName}`,
      `${baseDir}/${modelName}`,
    ].filter(Boolean) as string[];

    const uniquePaths = Array.from(new Set(rawPaths.flatMap(p => this.pathVariants(p))));

    for (const path of uniquePaths) {
      try {
        const info = await FileSystem.getInfoAsync(path, { size: true });
        if (!info.exists) {
          continue;
        }
        const size = (info as { size?: number }).size || 0;
        if (size <= 0) {
          continue;
        }
        const normalized = normalizePath(path);
        if (normalized.endsWith('.partial')) {
          continue;
        }
        return {
          path,
          size,
          isFinal: normalized.startsWith(normalizePath(baseDir)),
        };
      } catch {
      }
    }

    try {
      const tempDir = this.fileManager.getDownloadDir();
      const entries = await FileSystem.readDirectoryAsync(tempDir);
      const match = entries.find(entry => entry === modelName);
      if (match) {
        const path = `${tempDir}/${match}`;
        const info = await FileSystem.getInfoAsync(path, { size: true });
        if (info.exists) {
          const size = (info as { size?: number }).size || 0;
          if (size > 0) {
            return { path, size, isFinal: false };
          }
        }
      }
    } catch {
    }

    return null;
  }

  private async waitForDownloadFile(
    modelName: string,
    downloadInfo?: DownloadTaskInfo,
    attempts = 12,
    delayMs = 500,
  ): Promise<{ path: string; size: number; isFinal: boolean } | null> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const found = await this.resolveDownloadFile(modelName, downloadInfo);
      if (found) {
        return found;
      }

      if (attempt < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return null;
  }

  async ensureDownloadsAreRunning(): Promise<void> {
    try {
      const storedModels: StoredModel[] = Array.from(this.activeDownloads.values()).map(info => ({
        id: `${info.modelName}-${Date.now()}`,
        name: info.modelName,
        path: info.url || '',
        size: info.totalBytes || 0,
        modified: new Date().toISOString(),
        downloaded: false,
      }));

      const destinations = new Map(
        Array.from(this.activeDownloads.values()).map(info => [
          info.modelName,
          {
            temp: info.destination,
            final: `${this.fileManager.getBaseDir()}/${info.modelName}`,
          },
        ]),
      );

      await backgroundDownloadService.synchronizeWithActiveTransfers(storedModels, destinations);
    } catch (error) {
    }
  }

  async processCompletedDownloads(): Promise<void> {
    for (const [modelName, info] of this.activeDownloads.entries()) {
      if (info.status === 'completed') {
        this.activeDownloads.delete(modelName);
      }
    }
    await this.saveDownloadProgress();
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

  async getMLXManifest(packageName: string): Promise<string[]> {
    try {
      const key = mlxStorageManager.sanitizeModelId(packageName);
      const raw = await AsyncStorage.getItem(this.MLX_PACKAGE_MANIFEST_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      const files = parsed[key];
      return Array.isArray(files) ? files : [];
    } catch {
      return [];
    }
  }

  private async saveMLXManifest(packageName: string, files: string[]): Promise<void> {
    try {
      const key = mlxStorageManager.sanitizeModelId(packageName);
      const existingRaw = await AsyncStorage.getItem(this.MLX_PACKAGE_MANIFEST_KEY);
      const existing = existingRaw ? (JSON.parse(existingRaw) as Record<string, string[]>) : {};
      existing[key] = Array.from(new Set(files));
      await AsyncStorage.setItem(this.MLX_PACKAGE_MANIFEST_KEY, JSON.stringify(existing));
    } catch {
    }
  }

  private async removeMLXManifest(packageName: string): Promise<void> {
    try {
      const key = mlxStorageManager.sanitizeModelId(packageName);
      const existingRaw = await AsyncStorage.getItem(this.MLX_PACKAGE_MANIFEST_KEY);
      if (!existingRaw) {
        return;
      }
      const existing = JSON.parse(existingRaw) as Record<string, string[]>;
      if (!(key in existing)) {
        return;
      }
      delete existing[key];
      if (Object.keys(existing).length === 0) {
        await AsyncStorage.removeItem(this.MLX_PACKAGE_MANIFEST_KEY);
      } else {
        await AsyncStorage.setItem(this.MLX_PACKAGE_MANIFEST_KEY, JSON.stringify(existing));
      }
    } catch {
    }
  }

  private async saveDownloadProgress(): Promise<void> {
    if (this.saveTimer) {
      this.savePending = true;
      return;
    }

    await this.flushDownloadProgress();
  }

  private async flushDownloadProgress(): Promise<void> {
    try {
      const progressState = {
        activeDownloads: Array.from(this.activeDownloads.entries()).map(([key, value]) => ({
          modelName: key,
          downloadInfo: {
            downloadId: value.downloadId,
            modelName: value.modelName,
            destination: value.destination,
            nativeDownloadId: value.nativeDownloadId,
            url: value.url,
            progress: value.progress,
            bytesDownloaded: value.bytesDownloaded,
            totalBytes: value.totalBytes,
            status: value.status,
            lastPersistedProgress: value.lastPersistedProgress,
          }
        })),
        tempNameMap: Array.from(this.tempNameMap.entries()),
      };

      await AsyncStorage.setItem(
        this.DOWNLOAD_PROGRESS_KEY,
        JSON.stringify(progressState)
      );
    } catch (error) {
      // Failed to save download progress
    } finally {
      this.savePending = false;
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        if (this.savePending) {
          void this.flushDownloadProgress();
        }
      }, 2000);
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
            nativeDownloadId: item.downloadInfo.nativeDownloadId,
            url: item.downloadInfo.url,
            progress: item.downloadInfo.progress,
            bytesDownloaded: item.downloadInfo.bytesDownloaded,
            totalBytes: item.downloadInfo.totalBytes,
            status: item.downloadInfo.status,
            lastPersistedProgress: item.downloadInfo.lastPersistedProgress ?? item.downloadInfo.progress ?? 0,
          };
          
          this.activeDownloads.set(item.modelName, downloadInfo);
        }

        for (const [k, v] of progressState.tempNameMap || []) {
          this.tempNameMap.set(k, v);
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

  async downloadMLXModel(
    modelId: string,
    files: Array<{ filename: string; downloadUrl: string; size: number }>,
    authToken?: string,
    targetDirName?: string
  ): Promise<{ downloadId: number }> {
    const baseModelId = modelId.split('/').pop() || modelId;
    const selectedDir = (targetDirName || '').trim();
    const effectiveModelId = selectedDir || baseModelId;
    const sanitizedModelId = mlxStorageManager.sanitizeModelId(effectiveModelId);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    const hasSpace = await hasEnoughSpace(totalSize);
    if (!hasSpace) {
      throw new Error('insufficient_storage');
    }

    const modelDir = await mlxStorageManager.createMLXDirectory(effectiveModelId);
    const downloadId = this.nextDownloadId++;
    await this.saveMLXManifest(sanitizedModelId, files.map(file => file.filename));

    const tempDownloads: string[] = [];
    let downloadedBytes = 0;

    try {
      for (const file of files) {
        const tempFileName = `temp_mlx_${sanitizedModelId}_${Date.now()}_${file.filename}`;
        const tempFilePath = `${this.fileManager.getDownloadDir()}/${tempFileName}`;
        const finalFilePath = `${modelDir}/${file.filename}`;

        tempDownloads.push(tempFilePath);

        this.tempNameMap.set(tempFileName, sanitizedModelId);

        /*
          Register event listeners before calling startDownload to
          eliminate the race where a very small file completes and
          fires downloadCompleted before the Promise below attaches.
        */
        let fileResolve!: () => void;
        let fileReject!: (e: Error) => void;
        const filePromise = new Promise<void>((res, rej) => {
          fileResolve = res;
          fileReject = rej;
        });

        const matchesModelEvent = (event: { modelName?: string }) =>
          event.modelName === tempFileName || event.modelName === sanitizedModelId;

        const progressHandler = (event: DownloadProgressEvent) => {
          if (event.modelName === tempFileName) {
            const combinedProgress = (downloadedBytes + event.bytesDownloaded) / totalSize * 100;
            this.emit('progress', {
              progress: combinedProgress,
              bytesDownloaded: downloadedBytes + event.bytesDownloaded,
              totalBytes: totalSize,
              status: 'downloading',
              modelName: sanitizedModelId,
              downloadId,
            });
          }
        };

        const completeHandler = (event: any) => {
          if (matchesModelEvent(event)) {
            this.off('progress', progressHandler);
            this.off('downloadCompleted', completeHandler);
            this.off('downloadFailed', errorHandler);
            downloadedBytes += file.size;
            fileResolve();
          }
        };

        const errorHandler = (event: any) => {
          if (matchesModelEvent(event)) {
            this.off('progress', progressHandler);
            this.off('downloadCompleted', completeHandler);
            this.off('downloadFailed', errorHandler);
            fileReject(new Error(event.error || 'download_failed'));
          }
        };

        this.on('progress', progressHandler);
        this.on('downloadCompleted', completeHandler);
        this.on('downloadFailed', errorHandler);

        try {
          await this.startDownload(tempFileName, file.downloadUrl, authToken);
        } catch (startErr) {
          this.off('progress', progressHandler);
          this.off('downloadCompleted', completeHandler);
          this.off('downloadFailed', errorHandler);
          throw startErr;
        }

        const downloadInfo = this.activeDownloads.get(tempFileName);
        if (downloadInfo) {
          downloadInfo.downloadId = downloadId;
        }

        await filePromise;

        this.emit('progress', {
          progress: (downloadedBytes / totalSize) * 100,
          bytesDownloaded: downloadedBytes,
          totalBytes: totalSize,
          status: 'transferring',
          modelName: sanitizedModelId,
          downloadId,
        });

        const tempModelPath = `${this.fileManager.getBaseDir()}/${tempFileName}`;
        const fileExistsInTemp = await FileSystem.getInfoAsync(tempFilePath);
        const fileExistsInModels = await FileSystem.getInfoAsync(tempModelPath);

        if (fileExistsInTemp.exists) {
          await this.fileManager.moveFile(tempFilePath, finalFilePath);
        } else if (fileExistsInModels.exists) {
          await this.fileManager.moveFile(tempModelPath, finalFilePath);
        } else {
          throw new Error(`File not found after download: ${file.filename}`);
        }

        this.tempNameMap.delete(tempFileName);
      }

      this.emit('progress', {
        progress: 100,
        bytesDownloaded: totalSize,
        totalBytes: totalSize,
        status: 'transferring',
        modelName: sanitizedModelId,
        downloadId,
      });

      this.startedDisplayNames.delete(sanitizedModelId);
      await this.removeMLXManifest(sanitizedModelId);

      const validation = await mlxStorageManager.validateMLXModel(effectiveModelId);
      if (!validation.valid) {
        throw new Error(`incomplete_mlx_model: ${validation.missing.join(', ')}`);
      }

      this.emit('downloadCompleted', {
        modelName: sanitizedModelId,
        downloadId,
        modelFormat: ModelFormat.MLX,
      });

      return { downloadId };
    } catch (error) {
      for (const tempPath of tempDownloads) {
        try {
          await this.fileManager.deleteFile(tempPath);
        } catch {}
        
        try {
          const fileName = tempPath.split('/').pop() || '';
          const modelPath = `${this.fileManager.getBaseDir()}/${fileName}`;
          await this.fileManager.deleteFile(modelPath);
          this.tempNameMap.delete(fileName);
        } catch {}
      }

      this.startedDisplayNames.delete(sanitizedModelId);
  await this.removeMLXManifest(sanitizedModelId);

      await mlxStorageManager.cleanupFailedMLXDownload(effectiveModelId);

      this.emit('downloadFailed', {
        modelName: sanitizedModelId,
        downloadId,
        error: error instanceof Error ? error.message : 'mlx_download_failed',
      });

      throw error;
    }
  }
}
