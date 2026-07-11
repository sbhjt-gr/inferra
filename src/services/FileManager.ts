import { fs as FileSystem } from './fs';
import { EventEmitter } from './EventEmitter';
import { ImportProgressEvent } from './ModelDownloaderTypes';

export class FileManager extends EventEmitter {
  private readonly baseDir: string;
  private readonly downloadDir: string;

  constructor() {
    super();
    this.baseDir = `${FileSystem.documentDirectory}models`;
    this.downloadDir = `${FileSystem.documentDirectory}temp`;
  }

  async initializeDirectories(): Promise<void> {
    try {
      
      const modelsDirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!modelsDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
      } else {
      }
      
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.downloadDir, { intermediates: true });
      } else {
      }
      
      try {
        const modelFiles = await FileSystem.readDirectoryAsync(this.baseDir);
      } catch (error) {
      }
      
      try {
        const tempFiles = await FileSystem.readDirectoryAsync(this.downloadDir);
      } catch (error) {
      }
    } catch (error) {
      throw error;
    }
  }

  async moveFile(sourcePath: string, destPath: string): Promise<void> {
    const modelName = destPath.split('/').pop() || 'model';

    try {
      this.emit('importProgress', {
        modelName,
        status: 'importing'
      } as ImportProgressEvent);

      const sourceInfo = await FileSystem.getInfoAsync(sourcePath);
      if (!sourceInfo.exists) {
        const destInfoCheck = await FileSystem.getInfoAsync(destPath);
        if (destInfoCheck.exists) {
          this.emit('importProgress', { modelName, status: 'completed' } as ImportProgressEvent);
          return;
        }
        throw new Error(`Source file does not exist: ${sourcePath}`);
      }

      const destDir = destPath.substring(0, destPath.lastIndexOf('/'));
      const destDirInfo = await FileSystem.getInfoAsync(destDir);
      if (!destDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      }

      const destInfo = await FileSystem.getInfoAsync(destPath);
      if (destInfo.exists) {
        await FileSystem.deleteAsync(destPath, { idempotent: true });
      }

      const sourceSizeInfo = await FileSystem.getInfoAsync(sourcePath, { size: true });
      const sourceSize = (sourceSizeInfo as any).size || 0;
      console.log('moveFile_source_size', sourceSize);

      await new Promise(resolve => setTimeout(resolve, 600));

      console.log('moveFile_try_move', modelName);
      await this.tryMove(sourcePath, destPath, sourceSize);

      console.log('moveFile_dest_size', (await FileSystem.getInfoAsync(destPath, { size: true }) as any).size);

      this.emit('importProgress', {
        modelName,
        status: 'completed'
      } as ImportProgressEvent);

    } catch (error) {
      const destInfoCheck = await FileSystem.getInfoAsync(destPath);
      const sourceInfoCheck = await FileSystem.getInfoAsync(sourcePath);

      if (destInfoCheck.exists && !sourceInfoCheck.exists) {
        this.emit('importProgress', { modelName, status: 'completed' } as ImportProgressEvent);
        return;
      }

      this.emit('importProgress', {
        modelName,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      } as ImportProgressEvent);

      throw error;
    }
  }

  private async tryMove(sourcePath: string, destPath: string, expectedSize: number): Promise<void> {
    try {
      await FileSystem.moveAsync({ from: sourcePath, to: destPath });

      const destInfo = await FileSystem.getInfoAsync(destPath, { size: true });
      if (!destInfo.exists) {
        throw new Error('move_verify_failed');
      }
      console.log('moveFile_move_ok', (destInfo as any).size);
    } catch (moveError) {
      console.log('moveFile_move_failed', moveError instanceof Error ? moveError.message : 'unknown');

      await this.fallbackCopy(sourcePath, destPath, expectedSize);
    }
  }

  private async fallbackCopy(sourcePath: string, destPath: string, expectedSize: number): Promise<void> {
    console.log('moveFile_copy_fallback');

    const freeSpace = await FileSystem.getFreeDiskStorageAsync();
    if (freeSpace < expectedSize + 50 * 1024 * 1024) {
      throw new Error(`insufficient_space_for_copy: need ${expectedSize} bytes, have ${freeSpace} free`);
    }

    const maxRetries = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log('moveFile_copy_attempt', attempt);
        await FileSystem.copyAsync({ from: sourcePath, to: destPath });

        const destInfo = await FileSystem.getInfoAsync(destPath, { size: true });
        const destSize = (destInfo as any).size || 0;

        if (!destInfo.exists || destSize !== expectedSize) {
          await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
          throw new Error(`copy_size_mismatch: expected ${expectedSize}, got ${destSize}`);
        }

        await FileSystem.deleteAsync(sourcePath, { idempotent: true });
        console.log('moveFile_copy_ok', destSize);
        return;
      } catch (err) {
        lastError = err;
        console.log('moveFile_copy_retry', attempt, err instanceof Error ? err.message : 'unknown');
        await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('copy_fallback_exhausted');
  }

  async getFileSize(path: string): Promise<number> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(path);
      if (!fileInfo.exists) {
        return 0;
      }
      
      const statInfo = await FileSystem.getInfoAsync(path, { size: true });
      
      return ((statInfo as any).size) || 0;
    } catch (error) {
      return 0;
    }
  }

  async deleteFile(path: string): Promise<void> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(path);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(path, { idempotent: true });
      } else {
      }
    } catch (error) {
      throw error;
    }
  }

  async cleanupTempDirectory(activeDownloads: Set<string> = new Set()): Promise<void> {
    try {
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        return;
      }
      
      const contents = await FileSystem.readDirectoryAsync(this.downloadDir);
      const now = Date.now();
      const staleThreshold = 24 * 60 * 60 * 1000;
      // Staging names can sit briefly in temp/models between native
      // complete and MLX finalize — only purge after this window.
      const stagingStaleThreshold = 60 * 60 * 1000;
      
      for (const filename of contents) {
        if (activeDownloads.has(filename)) {
          continue;
        }
        
        const filePath = `${this.downloadDir}/${filename}`;
        
        try {
          const info = await FileSystem.getInfoAsync(filePath, { size: true });
          if (!info.exists) continue;
          
          const modTime = (info as any).modificationTime || 0;
          const ageMs = modTime > 0 ? now - modTime * 1000 : 0;
          const isStale = modTime > 0 && ageMs > staleThreshold;
          const isEmpty = (info as any).size === 0;
          const isStaleStaging =
            filename.startsWith('temp_mlx_') && modTime > 0 && ageMs > stagingStaleThreshold;
          
          if (isEmpty || isStale || isStaleStaging) {
            await FileSystem.deleteAsync(filePath, { idempotent: true });
            console.log('temp_cleaned', filename);
          }
        } catch {
          console.log('temp_cleanup_error', filename);
        }
      }

      await this.cleanupOrphanTempFilesInModels(activeDownloads, stagingStaleThreshold);
    } catch (error) {
      console.log('cleanup_dir_error', error);
    }
  }

  private async cleanupOrphanTempFilesInModels(
    activeDownloads: Set<string>,
    stagingStaleThreshold: number,
  ): Promise<void> {
    try {
      const modelsInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!modelsInfo.exists) {
        return;
      }

      const now = Date.now();
      const entries = await FileSystem.readDirectoryAsync(this.baseDir);
      for (const filename of entries) {
        if (!filename.startsWith('temp_mlx_') || activeDownloads.has(filename)) {
          continue;
        }

        try {
          const path = `${this.baseDir}/${filename}`;
          const info = await FileSystem.getInfoAsync(path, { size: true });
          if (!info.exists || info.isDirectory) {
            continue;
          }

          const modTime = (info as any).modificationTime || 0;
          const ageMs = modTime > 0 ? now - modTime * 1000 : 0;
          if (modTime > 0 && ageMs > stagingStaleThreshold) {
            await FileSystem.deleteAsync(path, { idempotent: true });
            console.log('models_temp_orphan_cleaned', filename);
          }
        } catch {
        }
      }
    } catch {
    }
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  getDownloadDir(): string {
    return this.downloadDir;
  }
} 
