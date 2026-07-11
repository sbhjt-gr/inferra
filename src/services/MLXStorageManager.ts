import { fs as FileSystem } from './fs';
import { ModelFormat } from '../types/models';

class MLXStorageManager {
  private modelsBaseDir = `${FileSystem.documentDirectory}models`;
  private mlxModelsDir = `${this.modelsBaseDir}/mlx`;

  async ensureBaseDirectories(): Promise<void> {
    try {
      const modelsInfo = await FileSystem.getInfoAsync(this.modelsBaseDir);
      if (!modelsInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.modelsBaseDir, { intermediates: true });
      }

      const mlxInfo = await FileSystem.getInfoAsync(this.mlxModelsDir);
      if (!mlxInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.mlxModelsDir, { intermediates: true });
      }
    } catch (error) {
      throw new Error(`failed_dir_setup: ${error}`);
    }
  }

  sanitizeModelId(modelId: string): string {
    return modelId.replace(/\//g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  getMLXModelDirectory(modelId: string): string {
    const sanitized = this.sanitizeModelId(modelId);
    return `${this.mlxModelsDir}/${sanitized}`;
  }

  async createMLXDirectory(modelId: string): Promise<string> {
    await this.ensureBaseDirectories();
    const modelDir = this.getMLXModelDirectory(modelId);
    
    const dirInfo = await FileSystem.getInfoAsync(modelDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(modelDir, { intermediates: true });
    }
    
    return modelDir;
  }

  async validateMLXModel(modelId: string): Promise<{ valid: boolean; missing: string[] }> {
    const modelDir = this.getMLXModelDirectory(modelId);
    const requiredFiles = [
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
    ];

    const missing: string[] = [];

    for (const file of requiredFiles) {
      const filePath = `${modelDir}/${file}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        missing.push(file);
      }
    }

    const dirInfo = await FileSystem.getInfoAsync(modelDir);
    if (dirInfo.exists && dirInfo.isDirectory) {
      const files = await FileSystem.readDirectoryAsync(modelDir);
      const hasWeights = files.some((f: string) => 
        f.endsWith('.safetensors') || f.endsWith('.npz')
      );

      if (!hasWeights) {
        missing.push('model_weights');
      }
    } else {
      missing.push('model_weights');
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  async cleanupFailedMLXDownload(modelId: string): Promise<void> {
    const modelDir = this.getMLXModelDirectory(modelId);
    const dirInfo = await FileSystem.getInfoAsync(modelDir);
    
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(modelDir, { idempotent: true });
    }

    // Nitro may also hold a partial under huggingface/models/<id>.
    const sanitized = this.sanitizeModelId(modelId);
    const nitroDirs = [
      `${FileSystem.documentDirectory}huggingface/models/${sanitized}`,
      `${FileSystem.documentDirectory}huggingface/models/${modelId}`,
    ];
    for (const dir of nitroDirs) {
      try {
        const info = await FileSystem.getInfoAsync(dir);
        if (info.exists) {
          await FileSystem.deleteAsync(dir, { idempotent: true });
        }
      } catch {
      }
    }
  }

  /**
   * Remove incomplete MLX packages that never passed validation.
   * These inflate "Clear All Models" size but never appear in the model list.
   */
  async cleanupIncompleteMLXModels(activeModelIds: Set<string> = new Set()): Promise<void> {
    await this.ensureBaseDirectories();

    const dirInfo = await FileSystem.getInfoAsync(this.mlxModelsDir);
    if (!dirInfo.exists) {
      return;
    }

    const dirs = await FileSystem.readDirectoryAsync(this.mlxModelsDir);
    for (const dirName of dirs) {
      if (activeModelIds.has(dirName)) {
        continue;
      }

      const dirPath = `${this.mlxModelsDir}/${dirName}`;
      try {
        const itemInfo = await FileSystem.getInfoAsync(dirPath);
        if (!itemInfo.exists || !itemInfo.isDirectory) {
          continue;
        }

        const validation = await this.validateMLXModel(dirName);
        if (!validation.valid) {
          await FileSystem.deleteAsync(dirPath, { idempotent: true });
          console.log('incomplete_mlx_purged', dirName, validation.missing.join(','));
        }
      } catch {
        console.log('incomplete_mlx_purge_error', dirName);
      }
    }
  }

  async getMLXModelSize(modelId: string): Promise<number> {
    const modelDir = this.getMLXModelDirectory(modelId);
    const dirInfo = await FileSystem.getInfoAsync(modelDir);
    
    if (!dirInfo.exists) {
      return 0;
    }

    const files = await FileSystem.readDirectoryAsync(modelDir);
    let totalSize = 0;

    for (const filename of files) {
      const filePath = `${modelDir}/${filename}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath, { size: true });
      if (fileInfo.exists && !fileInfo.isDirectory) {
        totalSize += (fileInfo as any).size || 0;
      }
    }

    return totalSize;
  }

  async getMLXModelFileCount(modelId: string): Promise<number> {
    const modelDir = this.getMLXModelDirectory(modelId);
    const dirInfo = await FileSystem.getInfoAsync(modelDir);
    
    if (!dirInfo.exists) {
      return 0;
    }

    const files = await FileSystem.readDirectoryAsync(modelDir);
    let count = 0;
    
    for (const filename of files) {
      const filePath = `${modelDir}/${filename}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists && !fileInfo.isDirectory) {
        count++;
      }
    }
    
    return count;
  }

  async listMLXModels(): Promise<Array<{ modelId: string; path: string; size: number; fileCount: number; modified: string }>> {
    await this.ensureBaseDirectories();
    
    const dirInfo = await FileSystem.getInfoAsync(this.mlxModelsDir);
    if (!dirInfo.exists) {
      return [];
    }

    const dirs = await FileSystem.readDirectoryAsync(this.mlxModelsDir);
    const mlxModels = [];

    for (const dirName of dirs) {
      const dirPath = `${this.mlxModelsDir}/${dirName}`;
      const itemInfo = await FileSystem.getInfoAsync(dirPath);
      
      if (itemInfo.exists && itemInfo.isDirectory) {
        const validation = await this.validateMLXModel(dirName);
        
        if (validation.valid) {
          const size = await this.getMLXModelSize(dirName);
          const fileCount = await this.getMLXModelFileCount(dirName);
          
          mlxModels.push({
            modelId: dirName,
            path: dirPath,
            size,
            fileCount,
            modified: new Date((itemInfo as any).modificationTime || Date.now()).toISOString(),
          });
        }
      }
    }

    return mlxModels;
  }

  async deleteMLXModel(modelId: string): Promise<void> {
    const modelDir = this.getMLXModelDirectory(modelId);
    const dirInfo = await FileSystem.getInfoAsync(modelDir);
    
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(modelDir, { idempotent: true });
    }
  }

  getGGUFModelsDirectory(): string {
    return this.modelsBaseDir;
  }
}

export const mlxStorageManager = new MLXStorageManager();
export default MLXStorageManager;
