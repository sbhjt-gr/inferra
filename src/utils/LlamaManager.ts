import { initLlama, loadLlamaModelInfo, type LlamaContext } from 'llama.rn';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { modelDownloader } from '../services/ModelDownloader';

interface ModelMemoryInfo {
  requiredMemory: number;
  availableMemory: number;
}

interface LlamaManagerInterface {
  getMemoryInfo(): Promise<ModelMemoryInfo>;
}

interface ModelSettings {
  maxTokens: number;
  temperature: number;
  topK: number;
  topP: number;
  minP: number;
  stopWords: string[];
  systemPrompt: string;
}

const DEFAULT_SETTINGS: ModelSettings = {
  maxTokens: 1200,
  temperature: 0.7,
  topK: 40,
  topP: 0.9,
  minP: 0.05,
  stopWords: ['</s>', '<|end|>', '<|im_end|>', '<|endoftext|>', '<｜end_of_sentence｜>', '<｜end▁of▁sentence｜>'],
  systemPrompt: 'You are an AI assistant.'
};

// Type assertion for the native module
const LlamaManagerModule = NativeModules.LlamaManager as LlamaManagerInterface;

class LlamaManager {
  private context: LlamaContext | null = null;
  private modelPath: string | null = null;
  private settings: ModelSettings = { ...DEFAULT_SETTINGS };

  constructor() {
    // Load settings when LlamaManager is instantiated
    this.loadSettings().catch(error => {
      console.error('Error loading settings:', error);
    });
  }

  async initializeModel(modelPath: string) {
    try {
      console.log('[LlamaManager] Initializing model from path:', modelPath);

      // Get the proper base directory
      const baseDir = await modelDownloader.getModelsDirectory();
      console.log('[LlamaManager] Base directory:', baseDir);

      // For external models, we need to handle the URI format
      let finalModelPath = modelPath;
      
      // If it's a file:// URI, we need to extract the actual path for native modules
      if (finalModelPath.startsWith('file://')) {
        // On iOS, we can just remove the file:// prefix
        if (Platform.OS === 'ios') {
          finalModelPath = finalModelPath.replace('file://', '');
        } 
        // On Android, we need to handle the path differently
        else if (Platform.OS === 'android') {
          finalModelPath = finalModelPath.replace('file://', '');
          // Ensure the path starts with a forward slash
          if (!finalModelPath.startsWith('/')) {
            finalModelPath = '/' + finalModelPath;
          }
        }
      } 
      // If it's a relative path (just model name), construct full path
      else if (!finalModelPath.includes('/')) {
        // Ensure the model name has .gguf extension
        if (!finalModelPath.toLowerCase().endsWith('.gguf')) {
          finalModelPath = `${finalModelPath}.gguf`;
        }
        finalModelPath = `${baseDir}/${finalModelPath}`;
      }
      
      console.log('[LlamaManager] Using final model path:', finalModelPath);

      // Verify the model file exists
      const modelExists = await modelDownloader.checkFileExists(finalModelPath);
      if (!modelExists) {
        throw new Error(`Model file not found at path: ${finalModelPath}`);
      }

      // Get file size to verify it's not empty
      try {
        const fileInfo = await modelDownloader.getFileSize(finalModelPath);
        if (!fileInfo || fileInfo === 0) {
          throw new Error('Model file exists but appears to be empty');
        }
        console.log('[LlamaManager] Model file size:', fileInfo);
      } catch (error) {
        console.error('[LlamaManager] Error checking model file size:', error);
        throw new Error('Failed to verify model file integrity');
      }

      // First load model info to validate the model
      try {
        console.log('[LlamaManager] Loading model info from:', finalModelPath);
        const modelInfo = await loadLlamaModelInfo(finalModelPath);
        console.log('[LlamaManager] Model Info:', modelInfo);

        if (!modelInfo) {
          throw new Error('Failed to load model info - invalid model file');
        }
      } catch (error) {
        console.error('[LlamaManager] Error loading model info:', error);
        throw new Error('Failed to validate model file - ensure this is a valid GGUF format model');
      }

      // Release existing context if any
      if (this.context) {
        await this.context.release();
        this.context = null;
      }

      this.modelPath = finalModelPath;
      
      // Initialize with recommended settings
      try {
        console.log('[LlamaManager] Initializing llama context with path:', finalModelPath);
        this.context = await initLlama({
          model: finalModelPath,
          use_mlock: true,
          n_ctx: 2048, // Reduced context size for better compatibility
          n_batch: 512,
          n_threads: Platform.OS === 'ios' ? 6 : 4,
          n_gpu_layers: 0, // Disable GPU layers by default for compatibility
          embedding: false,
          rope_freq_base: 10000,
          rope_freq_scale: 1,
        });

        if (!this.context) {
          throw new Error('Failed to initialize llama context');
        }

        console.log('[LlamaManager] Model initialized successfully');
        return this.context;
      } catch (error) {
        console.error('[LlamaManager] Error initializing llama context:', error);
        throw new Error(`Failed to initialize model: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    } catch (error) {
      console.error('[LlamaManager] Model initialization error:', error);
      throw error;
    }
  }

  async loadSettings() {
    try {
      const savedSettings = await AsyncStorage.getItem('@model_settings');
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        // Merge with default settings to ensure all properties exist
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...parsedSettings
        };
        console.log('[LlamaManager] Loaded settings:', this.settings);
      } else {
        // If no settings found, use defaults and save them
        this.settings = { ...DEFAULT_SETTINGS };
        await this.saveSettings();
        console.log('[LlamaManager] No saved settings found, using defaults');
      }
    } catch (error) {
      console.error('[LlamaManager] Error loading settings:', error);
      // On error, use default settings
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings() {
    try {
      await AsyncStorage.setItem('@model_settings', JSON.stringify(this.settings));
      console.log('[LlamaManager] Settings saved successfully');
    } catch (error) {
      console.error('[LlamaManager] Error saving settings:', error);
      throw error;
    }
  }

  async resetSettings() {
    this.settings = { ...DEFAULT_SETTINGS };
    await this.saveSettings();
    console.log('[LlamaManager] Settings reset to defaults');
  }

  // Settings getters and setters
  getSettings(): ModelSettings {
    return { ...this.settings };
  }

  async updateSettings(newSettings: Partial<ModelSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    console.log('[LlamaManager] Settings updated:', this.settings);
  }

  // Individual setting getters for backward compatibility
  getMaxTokens(): number {
    return this.settings.maxTokens;
  }

  async setMaxTokens(tokens: number) {
    await this.updateSettings({ maxTokens: tokens });
  }

  async generateResponse(
    messages: Array<{ role: string; content: string }>,
    onToken?: (token: string) => void
  ) {
    if (!this.context) {
      throw new Error('Model not initialized');
    }

    let fullResponse = '';

    try {
      const result = await this.context.completion(
        {
          messages,
          n_predict: this.settings.maxTokens,
          stop: this.settings.stopWords,
          temperature: this.settings.temperature,
          top_k: this.settings.topK,
          top_p: this.settings.topP,
          min_p: this.settings.minP,
          mirostat: 2,
          mirostat_tau: 5.0,
          mirostat_eta: 0.1,
        },
        (data) => {
          // Only check for complete stop words, not partial matches
          if (!this.settings.stopWords.includes(data.token)) {
            fullResponse += data.token;
            onToken?.(data.token);
            return true;
          }
          return false;
        }
      );

      return fullResponse.trim();
    } catch (error) {
      console.error('Generation error:', error);
      throw error;
    }
  }

  async release() {
    try {
      if (this.context) {
        await this.context.release();
        this.context = null;
        this.modelPath = null;
      }
    } catch (error) {
      console.error('Release error:', error);
      throw error;
    }
  }

  getModelPath() {
    return this.modelPath;
  }

  async checkMemoryRequirements(): Promise<ModelMemoryInfo> {
    try {
      if (!LlamaManagerModule?.getMemoryInfo) {
        return {
          requiredMemory: 0,
          availableMemory: 0
        };
      }
      return await LlamaManagerModule.getMemoryInfo();
    } catch (error) {
      console.warn('Memory info check failed:', error);
      return {
        requiredMemory: 0,
        availableMemory: 0
      };
    }
  }

  isInitialized(): boolean {
    return this.context !== null;
  }
}

export const llamaManager = new LlamaManager(); 