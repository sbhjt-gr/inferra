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
  private isInitialized: boolean = false;
  private isInitializing: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(fileManager: FileManager) {
    super();
    this.fileManager = fileManager;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('manager_already_initialized');
      return;
    }

    if (this.isInitializing) {
      console.log('manager_init_in_progress');
      await this.initializationPromise;
      return;
    }

    this.isInitializing = true;
    this.initializationPromise = (async () => {
      console.log('manager_init_start');
      try {
        await this.syncStorageWithFileSystem();
        this.isInitialized = true;
        console.log('manager_init_complete');
      } catch (error) {
        console.log('manager_init_error', error);
        throw error;
      } finally {
        this.isInitializing = false;
      }
    })();

    await this.initializationPromise;
  }

  async getStoredModels(): Promise<StoredModel[]> {
    console.log('get_models_start');
    try {
      const storedData = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (storedData) {
        console.log('models_from_storage');
        return JSON.parse(storedData);
      }
    } catch (error) {
      console.log('storage_read_error', error);
    }

    console.log('no_cached_models');
    return [];
  }

  private async scanFileSystemAndUpdateStorage(): Promise<StoredModel[]> {
    console.log('scan_filesystem_start');
    try {
      const baseDir = this.fileManager.getBaseDir();
      console.log('base_dir', baseDir);

      const dirInfo = await FileSystem.getInfoAsync(baseDir);
      if (!dirInfo.exists) {
        console.log('dir_not_exists');
        await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
        const emptyModels: StoredModel[] = [];
        await this.saveModelsToStorage(emptyModels);
        return emptyModels;
      }

      console.log('reading_directory');
      const dir = await FileSystem.readDirectoryAsync(baseDir);
      console.log('files_found', dir.length);

      let models: StoredModel[] = [];
      if (dir.length > 0) {
        console.log('processing_files');
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

      console.log('saving_to_storage', models.length);
      await this.saveModelsToStorage(models);
      console.log('scan_complete');
      return models;
    } catch (error) {
      console.log('scan_error', error);
      const emptyModels: StoredModel[] = [];
      await this.saveModelsToStorage(emptyModels);
      return emptyModels;
    }
  }

  private async syncStorageWithFileSystem(): Promise<void> {
    console.log('sync_start');
    try {
      const storedData = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (storedData) {
        console.log('storage_exists_skip_sync');
        return;
      }
      
      console.log('no_storage_scanning_filesystem');
      await this.scanFileSystemAndUpdateStorage();
      console.log('sync_complete');
    } catch (error) {
      console.log('sync_error', error);
    }
  }

  private async saveModelsToStorage(models: StoredModel[]): Promise<void> {
    console.log('save_storage_start', models.length);
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(models));
      console.log('save_storage_complete');
    } catch (error) {
      console.log('save_storage_error', error);
      throw error;
    }
  }

  async deleteModel(path: string): Promise<void> {
    try {
      await this.fileManager.deleteFile(path);
      
      const dir = path.substring(0, path.lastIndexOf('/'));
      const baseName = path.substring(path.lastIndexOf('/') + 1);
      const potentialProjectorName = baseName.replace('.gguf', '-mmproj-f16.gguf');
      const potentialProjectorPath = `${dir}/${potentialProjectorName}`;
      
      let projectorDeleted = false;
      try {
        const projectorInfo = await FileSystem.getInfoAsync(potentialProjectorPath);
        if (projectorInfo?.exists) {
          await this.fileManager.deleteFile(potentialProjectorPath);
          projectorDeleted = true;
          console.log('mmproj_deleted', potentialProjectorName);
        }
      } catch (projectorError) {
        console.log('mmproj_delete_check_error', projectorError);
      }
      
      const currentModels = await this.getStoredModels();
      let updatedModels = currentModels.filter(model => model.path !== path);
      
      if (projectorDeleted) {
        updatedModels = updatedModels.filter(model => model.path !== potentialProjectorPath);
      }
      
      await this.saveModelsToStorage(updatedModels);
      
      this.emit('modelsChanged');
    } catch (error) {
      console.log('delete_model_error', error);
      throw error;
    }
  }

  public async refresh(): Promise<void> {
    await this.scanFileSystemAndUpdateStorage();
    this.emit('modelsChanged');
  }

  async clearAllModels(): Promise<void> {
    try {
      const emptyModels: StoredModel[] = [];
      await this.saveModelsToStorage(emptyModels);
      this.emit('modelsChanged');
      console.log('all_models_cleared_from_storage');
    } catch (error) {
      console.log('clear_all_models_error', error);
      throw error;
    }
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
