import { llamaManager } from '../utils/LlamaManager';
import { onlineModelService } from './OnlineModelService';

interface APIMessage {
  action: string;
  data?: any;
}

interface APIResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export class WebRTCAPIHandler {
  private llamaManager = llamaManager;
  private onlineModelService = onlineModelService;

  async handleMessage(message: APIMessage): Promise<APIResponse> {
    const { action, data } = message;

    switch (action) {
      case 'getModels':
        return this.getModels();
      
      case 'getCurrentModel':
        return this.getCurrentModel();
      
      case 'loadModel':
        return this.loadModel(data);
      
      case 'unloadModel':
        return this.unloadModel();
      
      case 'chat':
        return this.chat(data);
      
      case 'getOnlineModels':
        return this.getOnlineModels();

      default:
        return {
          success: false,
          error: 'unknown_action',
        };
    }
  }

  handleStream(message: APIMessage, callback: (chunk: any) => void): void {
    const { action, data } = message;

    if (action === 'chatStream') {
      this.chatStream(data, callback);
    } else {
      callback({ done: true, error: 'unknown_action' });
    }
  }

  private async getModels(): Promise<APIResponse> {
    try {
      const modelPath = this.llamaManager.getModelPath();
      const multimodalProjectorPath = this.llamaManager.getMultimodalProjectorPath();
      const multimodalSupport = this.llamaManager.getMultimodalSupport();

      return {
        success: true,
        data: {
          currentModel: modelPath ? {
            path: modelPath,
            multimodalProjectorPath,
            multimodalSupport,
          } : null,
          onlineProviders: ['gemini', 'openai', 'deepseek', 'claude'],
        },
      };
    } catch (error: any) {
      console.error('get_models_error', error);
      return {
        success: false,
        error: error.message || 'failed_to_get_models',
      };
    }
  }

  private async getCurrentModel(): Promise<APIResponse> {
    try {
      const modelPath = this.llamaManager.getModelPath();
      const settings = this.llamaManager.getSettings();

      return {
        success: true,
        data: {
          modelPath: modelPath || null,
          isLoaded: !!modelPath,
          settings: {
            maxTokens: this.llamaManager.getMaxTokens(),
            temperature: this.llamaManager.getTemperature(),
            seed: this.llamaManager.getSeed(),
            enableThinking: this.llamaManager.getEnableThinking(),
          },
        },
      };
    } catch (error: any) {
      console.error('get_current_model_error', error);
      return {
        success: false,
        error: error.message || 'failed_to_get_current_model',
      };
    }
  }

  private async loadModel(data: any): Promise<APIResponse> {
    try {
      const { modelPath, mmProjectorPath } = data;

      if (!modelPath) {
        return {
          success: false,
          error: 'model_path_required',
        };
      }

      await this.llamaManager.loadModel(modelPath, mmProjectorPath);

      return {
        success: true,
        data: {
          modelPath,
          mmProjectorPath,
          loaded: true,
        },
      };
    } catch (error: any) {
      console.error('load_model_error', error);
      return {
        success: false,
        error: error.message || 'failed_to_load_model',
      };
    }
  }

  private async unloadModel(): Promise<APIResponse> {
    try {
      await this.llamaManager.unloadModel();

      return {
        success: true,
        data: {
          unloaded: true,
        },
      };
    } catch (error: any) {
      console.error('unload_model_error', error);
      return {
        success: false,
        error: error.message || 'failed_to_unload_model',
      };
    }
  }

  private async chat(data: any): Promise<APIResponse> {
    try {
      const { messages, provider, settings } = data;

      if (!messages || !Array.isArray(messages)) {
        return {
          success: false,
          error: 'messages_required',
        };
      }

      if (provider) {
        let response;
        
        switch (provider) {
          case 'gemini':
            response = await this.onlineModelService.sendMessageToGemini(messages, settings);
            break;
          case 'openai':
          case 'chatgpt':
            response = await this.onlineModelService.sendMessageToOpenAI(messages, settings);
            break;
          case 'deepseek':
            response = await this.onlineModelService.sendMessageToDeepSeek(messages, settings);
            break;
          case 'claude':
            response = await this.onlineModelService.sendMessageToClaude(messages, settings);
            break;
          default:
            return {
              success: false,
              error: 'unknown_provider',
            };
        }

        return {
          success: true,
          data: {
            response,
            provider,
          },
        };
      } else {
        const messageArray = messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        }));

        let fullResponse = '';
        
        await this.llamaManager.generateResponse(
          messageArray,
          (token: string) => {
            fullResponse += token;
          },
          settings
        );

        return {
          success: true,
          data: {
            response: fullResponse,
            provider: 'local',
          },
        };
      }
    } catch (error: any) {
      console.error('chat_error', error);
      return {
        success: false,
        error: error.message || 'chat_failed',
      };
    }
  }

  private chatStream(data: any, callback: (chunk: any) => void): void {
    try {
      const { messages, provider, settings } = data;

      if (!messages || !Array.isArray(messages)) {
        callback({ done: true, error: 'messages_required' });
        return;
      }

      if (provider) {
        this.streamOnlineChat(messages, provider, settings, callback);
      } else {
        this.streamLocalChat(messages, settings, callback);
      }

    } catch (error: any) {
      console.error('chat_stream_error', error);
      callback({ done: true, error: error.message || 'chat_stream_failed' });
    }
  }

  private async streamOnlineChat(
    messages: any[],
    provider: string,
    settings: any,
    callback: (chunk: any) => void
  ): Promise<void> {
    try {
      const streamSettings = {
        ...settings,
        stream: true,
        streamTokens: true,
      };

      let response;
      switch (provider) {
        case 'gemini':
          response = await this.onlineModelService.sendMessageToGemini(messages, streamSettings);
          break;
        case 'openai':
        case 'chatgpt':
          response = await this.onlineModelService.sendMessageToOpenAI(messages, streamSettings);
          break;
        case 'deepseek':
          response = await this.onlineModelService.sendMessageToDeepSeek(messages, streamSettings);
          break;
        case 'claude':
          response = await this.onlineModelService.sendMessageToClaude(messages, streamSettings);
          break;
        default:
          callback({ done: true, error: 'unknown_provider' });
          return;
      }

      if (response && typeof response === 'string') {
        const words = response.split(' ');
        for (const word of words) {
          callback({ token: word + ' ', done: false });
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      callback({ done: true });

    } catch (error: any) {
      console.error('online_stream_error', error);
      callback({ done: true, error: error.message });
    }
  }

  private async streamLocalChat(
    messages: any[],
    settings: any,
    callback: (chunk: any) => void
  ): Promise<void> {
    try {
      const messageArray = messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      }));

      await this.llamaManager.generateResponse(
        messageArray,
        (token: string) => {
          callback({ token, done: false });
        },
        settings
      );

      callback({ done: true });
    } catch (error: any) {
      console.error('local_stream_error', error);
      callback({ done: true, error: error.message });
    }
  }

  private async getOnlineModels(): Promise<APIResponse> {
    try {
      const providers = ['gemini', 'openai', 'deepseek', 'claude'];
      const models = [];

      for (const provider of providers) {
        const apiKey = await this.onlineModelService.getApiKey(provider);
        const modelName = await this.onlineModelService.getModelName(provider);

        models.push({
          provider,
          modelName: modelName || this.onlineModelService.getDefaultModelName(provider),
          configured: !!apiKey,
        });
      }

      return {
        success: true,
        data: {
          models,
        },
      };
    } catch (error: any) {
      console.error('get_online_models_error', error);
      return {
        success: false,
        error: error.message || 'failed_to_get_online_models',
      };
    }
  }
}

export const webrtcAPIHandler = new WebRTCAPIHandler();
