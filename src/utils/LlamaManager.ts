import { initLlama, loadLlamaModelInfo, type LlamaContext } from 'llama.rn';
import { Platform, NativeModules } from 'react-native';

interface ModelMemoryInfo {
  requiredMemory: number;
  availableMemory: number;
}

interface LlamaManagerInterface {
  getMemoryInfo(): Promise<ModelMemoryInfo>;
}

// Type assertion for the native module
const LlamaManagerModule = NativeModules.LlamaManager as LlamaManagerInterface;

class LlamaManager {
  private context: LlamaContext | null = null;
  private modelPath: string | null = null;

  async initializeModel(modelPath: string) {
    try {
      // First load model info to validate the model
      const modelInfo = await loadLlamaModelInfo(modelPath);
      console.log('Model Info:', modelInfo);

      // Release existing context if any
      if (this.context) {
        await this.context.release();
        this.context = null;
      }

      this.modelPath = modelPath;
      
      // Initialize with recommended settings
      this.context = await initLlama({
        model: modelPath,
        use_mlock: true,
        n_ctx: 2048,
        n_batch: 512,
        n_threads: Platform.OS === 'ios' ? 6 : 4,
        n_gpu_layers: Platform.OS === 'ios' ? 1 : 0, // Reduced for better stability
        embedding: false,
        rope_freq_base: 10000,
        rope_freq_scale: 1,
        low_vram: true,
      });

      return this.context;
    } catch (error) {
      console.error('Model initialization error:', error);
      throw new Error(`Failed to initialize model: ${error}`);
    }
  }

  async generateResponse(
    messages: Array<{ role: string; content: string }>,
    onToken?: (token: string) => void
  ) {
    if (!this.context) {
      throw new Error('Model not initialized');
    }

    const stopWords = [
      '</s>', '<|end|>', 'User:', 'Assistant:', '\n\n\n',
      '<|im_end|>', '<|endoftext|>'
    ];

    let fullResponse = '';

    try {
      const result = await this.context.completion(
        {
          messages,
          n_predict: 400,
          stop: stopWords,
          temperature: 0.7,
          top_k: 40,
          top_p: 0.9,
          min_p: 0.05,
          repeat_penalty: 1.1,
          tfs_z: 1.0,
          mirostat: 2,
          mirostat_tau: 5.0,
          mirostat_eta: 0.1,
        },
        (data) => {
          if (!stopWords.some(stop => data.token.includes(stop))) {
            fullResponse += data.token;
            onToken?.(data.token);
          }
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