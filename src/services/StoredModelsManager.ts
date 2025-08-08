import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { EventEmitter } from './EventEmitter';
import { FileManager } from './FileManager';
import { StoredModel } from './ModelDownloaderTypes';

export class StoredModelsManager extends EventEmitter {
  private externalModels: StoredModel[] = [];
  private readonly EXTERNAL_MODELS_KEY = 'external_models';
  private fileManager: FileManager;

  constructor(fileManager: FileManager) {
    super();
    this.fileManager = fileManager;
  }

  async initialize(): Promise<void> {
    await this.loadExternalModels();
  }

  async getStoredModels(): Promise<StoredModel[]> {
    try {
      console.log('[StoredModelsManager] Getting stored models');
      
      const baseDir = this.fileManager.getBaseDir();
      
      const dirInfo = await FileSystem.getInfoAsync(baseDir);
      if (!dirInfo.exists) {
        console.log('[StoredModelsManager] Models directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
        return [...this.externalModels]; 
      }
      
      const dir = await FileSystem.readDirectoryAsync(baseDir);
      console.log(`[StoredModelsManager] Found ${dir.length} files in models directory:`, dir);
      
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
            
            return {
              name,
              path,
              size,
              modified,
              isExternal: false
            };
          })
        );
      }
      
      return [...localModels, ...this.externalModels];
    } catch (error) {
      console.error('[StoredModelsManager] Error getting stored models:', error);
      return [...this.externalModels]; 
    }
  }

  async deleteModel(path: string): Promise<void> {
    try {
      console.log('[StoredModelsManager] Deleting model:', path);
      
      const externalModelIndex = this.externalModels.findIndex(model => model.path === path);
      if (externalModelIndex !== -1) {
        this.externalModels.splice(externalModelIndex, 1);
        await this.saveExternalModels();
        this.emit('modelsChanged');
        console.log('[StoredModelsManager] Removed external model reference:', path);
        return;
      }
      
      await this.fileManager.deleteFile(path);
      
      this.emit('modelsChanged');
    } catch (error) {
      console.error('[StoredModelsManager] Error deleting model:', error);
      throw error;
    }
  }

  async refreshStoredModels(): Promise<void> {
    try {
      console.log('[StoredModelsManager] Refreshing stored models list...');
      
      const storedModels = await this.getStoredModels();
      const storedModelNames = storedModels.map(model => model.name);
      
      const baseDir = this.fileManager.getBaseDir();
      const modelDirContents = await FileSystem.readDirectoryAsync(baseDir);
      
      for (const filename of modelDirContents) {
        if (!storedModelNames.includes(filename)) {
          console.log(`[StoredModelsManager] Found new model in directory: ${filename}`);
          
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
            
            console.log(`[StoredModelsManager] Added new model to stored models: ${filename}`);
          }
        }
      }
    } catch (error) {
      console.error('[StoredModelsManager] Error refreshing stored models:', error);
    }
  }

  async linkExternalModel(uri: string, fileName: string): Promise<void> {
    try {
      console.log(`[StoredModelsManager] Linking external model: ${fileName} from ${uri}`);
      
      const baseDir = this.fileManager.getBaseDir();
      const destPath = `${baseDir}/${fileName}`;
      const destInfo = await FileSystem.getInfoAsync(destPath);
      if (destInfo.exists) {
        throw new Error('A model with this name already exists in the models directory');
      }

      const existingExternal = this.externalModels.find(model => model.name === fileName);
      if (existingExternal) {
        throw new Error('A model with this name already exists in external models');
      }

      const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
      if (!fileInfo.exists) {
        throw new Error('External file does not exist');
      }

      let finalPath = uri;
      let isExternal = true;
      
      if (Platform.OS === 'android' && uri.startsWith('content://')) {
        console.log(`[StoredModelsManager] Android content URI detected, copying file to app directory`);
        
        const appModelPath = `${baseDir}/${fileName}`;
        
        try {
          const dirInfo = await FileSystem.getInfoAsync(baseDir);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
          }
          
          await FileSystem.copyAsync({
            from: uri,
            to: appModelPath
          });
          
          finalPath = appModelPath;
          isExternal = false; 
          
          console.log(`[StoredModelsManager] Successfully copied model to: ${appModelPath}`);
        } catch (error) {
          console.error(`[StoredModelsManager] Error copying file:`, error);
          throw new Error('Failed to copy the model file to the app directory');
        }
      }

      if (isExternal) {
        const newExternalModel: StoredModel = {
          name: fileName,
          path: finalPath,
          size: (fileInfo as any).size || 0,
          modified: new Date().toISOString(),
          isExternal: true
        };

        this.externalModels.push(newExternalModel);
        await this.saveExternalModels();
      }
      
      this.emit('modelsChanged');
      
      console.log(`[StoredModelsManager] Successfully linked model: ${fileName} at path: ${finalPath}`);
    } catch (error) {
      console.error(`[StoredModelsManager] Error linking model: ${fileName}`, error);
      throw error;
    }
  }

  async exportModel(modelPath: string, modelName: string): Promise<void> {
    try {
      console.log(`[StoredModelsManager] Starting export for model: ${modelName} from ${modelPath}`);

      // Check if the model file exists
      const fileInfo = await FileSystem.getInfoAsync(modelPath);
      if (!fileInfo.exists) {
        throw new Error('Model file does not exist');
      }

      // Check if sharing is available on this platform
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Sharing is not available on this device');
      }

      // For better compatibility, copy the file to a temporary location in the cache directory
      // This ensures the file is accessible for sharing
      const tempDir = FileSystem.cacheDirectory + 'export/';
      const tempDirInfo = await FileSystem.getInfoAsync(tempDir);
      if (!tempDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
      }

      const tempFilePath = tempDir + modelName;
      
      // Copy the model to temp location
      await FileSystem.copyAsync({
        from: modelPath,
        to: tempFilePath
      });

      console.log(`[StoredModelsManager] Copied model to temporary location: ${tempFilePath}`);

      // Share the file - this will open Android's file manager/share dialog
      await Sharing.shareAsync(tempFilePath, {
        mimeType: 'application/octet-stream',
        dialogTitle: `Export ${modelName}`,
      });

      console.log(`[StoredModelsManager] Successfully initiated export for model: ${modelName}`);
      
      // Note: We don't delete the temp file immediately as sharing might be async
      // The temp directory will be cleaned up on app restart or manually later
      
      // Emit an event to notify the UI
      this.emit('modelExported', { modelName, tempFilePath });

    } catch (error) {
      console.error(`[StoredModelsManager] Error exporting model: ${modelName}`, error);
      throw error;
    }
  }

  private async loadExternalModels(): Promise<void> {
    try {
      const externalModelsJson = await AsyncStorage.getItem(this.EXTERNAL_MODELS_KEY);
      if (externalModelsJson) {
        this.externalModels = JSON.parse(externalModelsJson);
        console.log('[StoredModelsManager] Loaded external models:', this.externalModels);
      }
    } catch (error) {
      console.error('[StoredModelsManager] Error loading external models:', error);
      this.externalModels = [];
    }
  }

  private async saveExternalModels(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.EXTERNAL_MODELS_KEY, JSON.stringify(this.externalModels));
      console.log('[StoredModelsManager] Saved external models:', this.externalModels);
    } catch (error) {
      console.error('[StoredModelsManager] Error saving external models:', error);
    }
  }
} 