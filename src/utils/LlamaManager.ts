import { initLlama, type LlamaContext } from 'llama.rn';
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
    if (this.context) {
      await this.context.release();
    }

    this.modelPath = modelPath;
    this.context = await initLlama({
      model: modelPath,
      use_mlock: true,
      n_ctx: 2048,
      n_gpu_layers: Platform.OS === 'ios' ? 99 : 0, 
    });

    return this.context;
  }

  async generateResponse(
    messages: Array<{ role: string; content: string }>,
    onToken?: (token: string) => void
  ) {
    if (!this.context) {
      throw new Error('Model not initialized');
    }

    const stopWords = [
      '</s>',
      '<|end|>',
      '<|eot_id|>',
      '<|end_of_text|>',
      '<|im_end|>',
      '<|EOT|>',
      '<|END_OF_TURN_TOKEN|>',
      '<|end_of_turn|>',
      '<|endoftext|>',
      '<|end_of_sentence|>',
    ];

    let fullResponse = '';

    const result = await this.context.completion(
      {
        messages,
        n_predict: 400,
        stop: stopWords,
        temperature: 0.7,
        top_p: 0.9,
      },
      (data) => {
        // Only process if token doesn't contain stop words
        if (!stopWords.some(stop => data.token.includes(stop))) {
          fullResponse += data.token;
          if (onToken) {
            onToken(data.token);
          }
        }
      }
    );

    // Clean up any remaining control tokens from the full response
    const cleanResponse = fullResponse.replace(/<\|.*?\|>/g, '').trim();
    return cleanResponse;
  }

  async release() {
    if (this.context) {
      await this.context.release();
      this.context = null;
    }
  }

  getModelPath() {
    return this.modelPath;
  }

  async checkMemoryRequirements(): Promise<ModelMemoryInfo> {
    try {
      // Fallback values if native module is not available
      if (!LlamaManagerModule?.getMemoryInfo) {
        console.warn('Memory info check not available on this platform');
        return {
          requiredMemory: 0,
          availableMemory: 0
        };
      }

      return await LlamaManagerModule.getMemoryInfo();
    } catch (error) {
      console.warn('Failed to get memory info:', error);
      // Return fallback values
      return {
        requiredMemory: 0,
        availableMemory: 0
      };
    }
  }
}

export const llamaManager = new LlamaManager(); 