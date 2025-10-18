import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { EventEmitter } from './EventEmitter';
import { FileManager } from './FileManager';
import { StoredModel } from './ModelDownloaderTypes';
import { detectVisionCapabilities } from '../utils/multimodalHelpers';
import { ModelType } from '../types/models';

export class StoredModelsManager extends EventEmitter {
  private fileManager: FileManager;
  private cachedModels: StoredModel[] | null = null;
  private lastCacheTime: number = 0;
  private readonly CACHE_TTL = 500;

  constructor(fileManager: FileManager) {
    super();
    this.fileManager = fileManager;
  }

  async initialize(): Promise<void> {
  }

  async getStoredModels(): Promise<StoredModel[]> {
    const now = Date.now();

    if (this.cachedModels && (now - this.lastCacheTime) < this.CACHE_TTL) {
      return this.cachedModels;
    }

    try {
      const baseDir = this.fileManager.getBaseDir();

      const dirInfo = await FileSystem.getInfoAsync(baseDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
        this.cachedModels = [];
        this.lastCacheTime = now;
        return this.cachedModels;
      }

      const dir = await FileSystem.readDirectoryAsync(baseDir);

      let localModels: StoredModel[] = [];
      if (dir.length > 0) {
        localModels = await Promise.all(
          dir.map(async (name) => {
            const path = `${baseDir}/${name}`;
            const fileInfo = await FileSystem.getInfoAsync(path, { size: true });

            let size = 0;
            if (fileInfo.exists) {
              size = (fileInfo as any).size || 0;
            }

            const modified = new Date().toISOString();

            const capabilities = detectVisionCapabilities(name);
            const modelType = capabilities.isProjection
              ? ModelType.PROJECTION
              : capabilities.isVision
                ? ModelType.VISION
                : ModelType.LLM;

            return {
              name,
              path,
              size,
              modified,
              isExternal: false,
              modelType,
              capabilities: capabilities.capabilities,
              supportsMultimodal: capabilities.isVision,
              compatibleProjectionModels: capabilities.compatibleProjections,
              defaultProjectionModel: capabilities.defaultProjection,
            };
          })
        );
      }

      this.cachedModels = localModels;
      this.lastCacheTime = now;
      return this.cachedModels;
    } catch (error) {
      this.cachedModels = [];
      this.lastCacheTime = now;
      return this.cachedModels;
    }
  }

  async deleteModel(path: string): Promise<void> {
    try {
      await this.fileManager.deleteFile(path);
      this.invalidateCache();
      this.emit('modelsChanged');
    } catch (error) {
      throw error;
    }
  }

  private invalidateCache(): void {
    this.cachedModels = null;
    this.lastCacheTime = 0;
  }

  public refresh(): void {
    this.invalidateCache();
  }

  async refreshStoredModels(): Promise<void> {
    try {
      
      const storedModels = await this.getStoredModels();
      const storedModelNames = storedModels.map(model => model.name);
      
      const baseDir = this.fileManager.getBaseDir();
      const modelDirContents = await FileSystem.readDirectoryAsync(baseDir);
      
      for (const filename of modelDirContents) {
        if (!storedModelNames.includes(filename)) {
          
          const filePath = `${baseDir}/${filename}`;
          const fileInfo = await FileSystem.getInfoAsync(filePath, { size: true });
          
          if (fileInfo.exists) {
            const downloadId = Math.floor(Math.random() * 1000) + 1;
            this.emit('downloadProgress', {
              modelName: filename,
              progress: 100,
              bytesDownloaded: (fileInfo as any).size || 0,
              totalBytes: (fileInfo as any).size || 0,
              status: 'completed',
              downloadId
            });
            
          }
        }
      }
    } catch (error) {
    }
  }

  async linkExternalModel(uri: string, fileName: string): Promise<void> {
    try {
      const baseDir = this.fileManager.getBaseDir();
      const destPath = `${baseDir}/${fileName}`;
      const destInfo = await FileSystem.getInfoAsync(destPath);
      if (destInfo.exists) {
        throw new Error('A model with this name already exists in the models directory');
      }

      const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
      if (!fileInfo.exists) {
        throw new Error('External file does not exist');
      }

      const dirInfo = await FileSystem.getInfoAsync(baseDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
      }

      await FileSystem.copyAsync({
        from: uri,
        to: destPath
      });

      this.invalidateCache();
      this.emit('modelsChanged');

    } catch (error) {
      throw error;
    }
  }

  async exportModel(modelPath: string, modelName: string): Promise<void> {
    try {

      const fileInfo = await FileSystem.getInfoAsync(modelPath);
      if (!fileInfo.exists) {
        throw new Error('Model file does not exist');
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Sharing is not available on this device');
      }

      const tempDir = FileSystem.cacheDirectory + 'export/';
      const tempDirInfo = await FileSystem.getInfoAsync(tempDir);
      if (!tempDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
      }

      const tempFilePath = tempDir + modelName;
      
      await FileSystem.copyAsync({
        from: modelPath,
        to: tempFilePath
      });


      await Sharing.shareAsync(tempFilePath, {
        mimeType: 'application/octet-stream',
        dialogTitle: `Export ${modelName}`,
      });

      
      this.emit('modelExported', { modelName, tempFilePath });

    } catch (error) {
      throw error;
    }
  }
} 
