import { initLlama, loadLlamaModelInfo, type LlamaContext } from 'ragionare-llama.rn';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EventEmitter from 'eventemitter3';

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

interface LlamaManagerEvents {
  'model-loaded': (modelPath: string | null) => void;
  'model-unloaded': () => void;
}

const DEFAULT_SETTINGS: ModelSettings = {
  maxTokens: 1200,
  temperature: 0.7,
  topK: 40,
  topP: 0.9,
  minP: 0.05,
  stopWords: ['<|end|>', '<end_of_turn>', '<|im_end|>', '<|endoftext|>', '<\uff5cend\u2581of\u2581sentence\uff5c>'],
  systemPrompt: 'You are an AI assistant.'
};

const LlamaManagerModule = NativeModules.LlamaManager as LlamaManagerInterface;

class LlamaManager {
  private context: LlamaContext | null = null;
  private modelPath: string | null = null;
  private settings: ModelSettings = { ...DEFAULT_SETTINGS };
  private events = new EventEmitter<LlamaManagerEvents>();
  private isCancelled: boolean = false;

  constructor() {
    
    this.loadSettings().catch(error => {
      console.error('Error loading settings:', error);
    });
  }

  async initializeModel(modelPath: string) {
    try {
      console.log('[LlamaManager] Initializing model from path:', modelPath);

      
      let finalModelPath = modelPath;
      
      
      if (finalModelPath.startsWith('file://')) {
        
        if (Platform.OS === 'ios') {
          finalModelPath = finalModelPath.replace('file://', '');
        } 
        
        else if (Platform.OS === 'android') {
          
          
          
          finalModelPath = finalModelPath.replace('file://', '');
        }
      }
      
      console.log('[LlamaManager] Using final model path:', finalModelPath);

      
      const modelInfo = await loadLlamaModelInfo(finalModelPath);
      console.log('[LlamaManager] Model Info:', modelInfo);

      
      if (this.context) {
        await this.context.release();
        this.context = null;
      }

      this.modelPath = finalModelPath;
      
      
      this.context = await initLlama({
        model: finalModelPath,
        use_mlock: true,
        n_ctx: 6144,
        n_batch: 512,
        n_threads: Platform.OS === 'ios' ? 6 : 4,
        n_gpu_layers: Platform.OS === 'ios' ? 1 : 0,
        embedding: false,
        rope_freq_base: 10000,
        rope_freq_scale: 1,
      });

      console.log('[LlamaManager] Model initialized successfully');
      return this.context;
    } catch (error) {
      console.error('[LlamaManager] Model initialization error:', error);
      throw new Error(`Failed to initialize model: ${error}`);
    }
  }

  async loadSettings() {
    try {
      const savedSettings = await AsyncStorage.getItem('@model_settings');
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...parsedSettings
        };
        console.log('[LlamaManager] Loaded settings:', this.settings);
      } else {
        
        this.settings = { ...DEFAULT_SETTINGS };
        await this.saveSettings();
        console.log('[LlamaManager] No saved settings found, using defaults');
      }
    } catch (error) {
      console.error('[LlamaManager] Error loading settings:', error);
      
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

  
  getSettings(): ModelSettings {
    return { ...this.settings };
  }

  async updateSettings(newSettings: Partial<ModelSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    console.log('[LlamaManager] Settings updated:', this.settings);
  }

  
  getMaxTokens(): number {
    return this.settings.maxTokens;
  }

  async setMaxTokens(tokens: number) {
    await this.updateSettings({ maxTokens: tokens });
  }

  async generateResponse(
    messages: Array<{ role: string; content: string }>,
    onToken?: (token: string) => boolean | void
  ) {
    if (!this.context) {
      throw new Error('Model not initialized');
    }

    let fullResponse = '';
    this.isCancelled = false;

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
          if (this.isCancelled) {
            console.log('[LlamaManager] Generation cancelled');
            return false;
          }
          
          if (!this.settings.stopWords.includes(data.token)) {
            fullResponse += data.token;
            const shouldContinue = onToken?.(data.token);
            if (shouldContinue === false) {
              this.isCancelled = true;
              return false;
            }
            return true;
          }
          return false;
        }
      );

      return fullResponse.trim();
    } catch (error) {
      console.error('Generation error:', error);
      throw error;
    } finally {
      this.isCancelled = false;
    }
  }

  async cancelGeneration() {
    console.log('[LlamaManager] Cancelling generation');
    this.isCancelled = true;
    
    if (this.modelPath && this.context) {
      try {
        const currentModelPath = this.modelPath;
        
        await this.context.release();
        this.context = null;
        
        this.context = await initLlama({
          model: currentModelPath,
          use_mlock: true,
          n_ctx: 6144,
          n_batch: 512,
          n_threads: Platform.OS === 'ios' ? 6 : 4,
          n_gpu_layers: Platform.OS === 'ios' ? 1 : 0,
          embedding: false,
          rope_freq_base: 10000,
          rope_freq_scale: 1,
        });
        
        console.log('[LlamaManager] Context reinitialized after cancellation');
      } catch (error) {
        console.error('[LlamaManager] Error reinitializing context after cancellation:', error);
        this.context = null;
      }
    }
  }

  async release() {
    try {
      this.isCancelled = true;
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

  async loadModel(modelPath: string) {
    try {
      await this.release();
      await this.initializeModel(modelPath);
      this.events.emit('model-loaded', modelPath);
      return true;
    } catch (error) {
      console.error('Error loading model:', error);
      return false;
    }
  }

  async unloadModel() {
    await this.release();
    this.events.emit('model-unloaded');
  }

  addListener(event: keyof LlamaManagerEvents, listener: any): () => void {
    this.events.on(event, listener);
    return () => this.events.off(event, listener);
  }

  removeListener(event: keyof LlamaManagerEvents, listener: any): void {
    this.events.off(event, listener);
  }
}

export const llamaManager = new LlamaManager(); 