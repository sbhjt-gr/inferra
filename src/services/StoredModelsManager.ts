import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventEmitter } from './EventEmitter';
import { FileManager } from './FileManager';
import { StoredModel } from './ModelDownloaderTypes';
import { detectVisionCapabilities } from '../utils/multimodalHelpers';
import { ModelType } from '../types/models';

export class StoredModelsManager extends EventEmitter {
  private fileManager: FileManager;
  private readonly STORAGE_KEY = 'stored_models_list';

  constructor(fileManager: FileManager) {
    super();
    this.fileManager = fileManager;
  }

  async initialize(): Promise<void> {
    await this.syncStorageWithFileSystem();
  }

  async getStoredModels(): Promise<StoredModel[]> {
    try {
      const storedData = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (storedData) {
        return JSON.parse(storedData);
      }
    } catch (error) {
    }

    return await this.scanFileSystemAndUpdateStorage();
  }

  private async scanFileSystemAndUpdateStorage(): Promise<StoredModel[]> {
    try {
      const baseDir = this.fileManager.getBaseDir();

      const dirInfo = await FileSystem.getInfoAsync(baseDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
        const emptyModels: StoredModel[] = [];
        await this.saveModelsToStorage(emptyModels);
        return emptyModels;
      }

      const dir = await FileSystem.readDirectoryAsync(baseDir);

      let models: StoredModel[] = [];
      if (dir.length > 0) {
        models = await Promise.all(
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

      await this.saveModelsToStorage(models);
      return models;
    } catch (error) {
      const emptyModels: StoredModel[] = [];
      await this.saveModelsToStorage(emptyModels);
      return emptyModels;
    }
  }

  private async syncStorageWithFileSystem(): Promise<void> {
    try {
      await this.scanFileSystemAndUpdateStorage();
    } catch (error) {
    }
  }

  private async saveModelsToStorage(models: StoredModel[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(models));
    } catch (error) {
    }
  }

  async deleteModel(path: string): Promise<void> {
    try {
      await this.fileManager.deleteFile(path);
      
      const currentModels = await this.getStoredModels();
      const updatedModels = currentModels.filter(model => model.path !== path);
      await this.saveModelsToStorage(updatedModels);
      
      this.emit('modelsChanged');
    } catch (error) {
      throw error;
    }
  }

  public async refresh(): Promise<void> {
    await this.scanFileSystemAndUpdateStorage();
    this.emit('modelsChanged');
  }

  async reloadStoredModels(): Promise<StoredModel[]> {
    return await this.scanFileSystemAndUpdateStorage();
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
            
            await this.scanFileSystemAndUpdateStorage();
            this.emit('modelsChanged');
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

      const size = (fileInfo as any).size || 0;
      const capabilities = detectVisionCapabilities(fileName);
      const modelType = capabilities.isProjection
        ? ModelType.PROJECTION
        : capabilities.isVision
          ? ModelType.VISION
          : ModelType.LLM;

      const newModel: StoredModel = {
        name: fileName,
        path: destPath,
        size,
        modified: new Date().toISOString(),
        isExternal: true,
        modelType,
        capabilities: capabilities.capabilities,
        supportsMultimodal: capabilities.isVision,
        compatibleProjectionModels: capabilities.compatibleProjections,
        defaultProjectionModel: capabilities.defaultProjection,
      };

      const currentModels = await this.getStoredModels();
      const updatedModels = [...currentModels, newModel];
      await this.saveModelsToStorage(updatedModels);

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
