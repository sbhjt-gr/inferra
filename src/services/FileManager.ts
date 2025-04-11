import * as FileSystem from 'expo-file-system';
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
      console.log('[FileManager] Initializing directories...');
      console.log('[FileManager] Models directory:', this.baseDir);
      console.log('[FileManager] Temp directory:', this.downloadDir);
      
      const modelsDirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!modelsDirInfo.exists) {
        console.log('[FileManager] Models directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
      } else {
        console.log('[FileManager] Models directory already exists');
      }
      
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        console.log('[FileManager] Temp directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.downloadDir, { intermediates: true });
      } else {
        console.log('[FileManager] Temp directory already exists');
      }
      
      try {
        const modelFiles = await FileSystem.readDirectoryAsync(this.baseDir);
        console.log(`[FileManager] Found ${modelFiles.length} files in models directory:`, modelFiles);
      } catch (error) {
        console.error('[FileManager] Error listing models directory:', error);
      }
      
      try {
        const tempFiles = await FileSystem.readDirectoryAsync(this.downloadDir);
        console.log(`[FileManager] Found ${tempFiles.length} files in temp directory:`, tempFiles);
      } catch (error) {
        console.error('[FileManager] Error listing temp directory:', error);
      }
    } catch (error) {
      console.error('[FileManager] Error initializing directories:', error);
      throw error;
    }
  }

  async moveFile(sourcePath: string, destPath: string): Promise<void> {
    console.log(`[FileManager] Moving file from ${sourcePath} to ${destPath}`);
    
    try {
      const modelName = destPath.split('/').pop() || 'model';
      console.log(`[FileManager] Emitting importProgress event for ${modelName} (importing)`);
      
      this.emit('importProgress', {
        modelName,
        status: 'importing'
      } as ImportProgressEvent);

      const sourceInfo = await FileSystem.getInfoAsync(sourcePath);
      if (!sourceInfo.exists) {
        throw new Error(`Source file does not exist: ${sourcePath}`);
      }
      
      const destDir = destPath.substring(0, destPath.lastIndexOf('/'));
      const destDirInfo = await FileSystem.getInfoAsync(destDir);
      if (!destDirInfo.exists) {
        console.log(`[FileManager] Creating destination directory: ${destDir}`);
        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      }
      
      const destInfo = await FileSystem.getInfoAsync(destPath);
      if (destInfo.exists) {
        console.log(`[FileManager] Destination file already exists, deleting it: ${destPath}`);
        await FileSystem.deleteAsync(destPath, { idempotent: true });
      }
      
      console.log(`[FileManager] Executing moveAsync from ${sourcePath} to ${destPath}`);
      await FileSystem.moveAsync({
        from: sourcePath,
        to: destPath
      });
      
      const newDestInfo = await FileSystem.getInfoAsync(destPath);
      if (!newDestInfo.exists) {
        throw new Error(`File was not moved successfully to ${destPath}`);
      }

      console.log(`[FileManager] Emitting importProgress event for ${modelName} (completed)`);
      
      this.emit('importProgress', {
        modelName,
        status: 'completed'
      } as ImportProgressEvent);
      
      console.log(`[FileManager] File successfully moved to ${destPath}`);
    } catch (error) {
      const modelName = destPath.split('/').pop() || 'model';
      console.log(`[FileManager] Emitting importProgress event for ${modelName} (error)`);
      
      this.emit('importProgress', {
        modelName,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      } as ImportProgressEvent);

      console.error(`[FileManager] Error moving file from ${sourcePath} to ${destPath}:`, error);
      throw error;
    }
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
      console.error(`[FileManager] Error getting file size for ${path}:`, error);
      return 0;
    }
  }

  async deleteFile(path: string): Promise<void> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(path);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(path, { idempotent: true });
        console.log(`[FileManager] Deleted file: ${path}`);
      } else {
        console.log(`[FileManager] File not found for deletion: ${path}`);
      }
    } catch (error) {
      console.error(`[FileManager] Error deleting file: ${path}`, error);
      throw error;
    }
  }

  async cleanupTempDirectory(): Promise<void> {
    try {
      console.log('[FileManager] Checking temp directory for cleanup...');
      
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        console.log('[FileManager] Temp directory does not exist, nothing to clean up');
        return;
      }
      
      const downloadDirContents = await FileSystem.readDirectoryAsync(this.downloadDir);
      console.log(`[FileManager] Found ${downloadDirContents.length} files in temp directory:`, downloadDirContents);
      
      for (const filename of downloadDirContents) {
        const sourcePath = `${this.downloadDir}/${filename}`;
        
        const sourceInfo = await FileSystem.getInfoAsync(sourcePath, { size: true });
        if (!sourceInfo.exists || (sourceInfo as any).size === 0) {
          console.log(`[FileManager] Removing empty/invalid file from temp: ${filename}`);
          try {
            await FileSystem.deleteAsync(sourcePath, { idempotent: true });
          } catch (error) {
            console.error(`[FileManager] Error deleting temp file ${filename}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('[FileManager] Error cleaning up temp directory:', error);
    }
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  getDownloadDir(): string {
    return this.downloadDir;
  }
} 