import { ChatMessage } from '../utils/ChatManager';
import { llamaManager } from '../utils/LlamaManager';
import { onlineModelService } from './OnlineModelService';
import { modelDownloader } from './ModelDownloader';

interface BridgeMessage {
  id: string;
  method: string;
  data: any;
}

interface BridgeResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

interface ModelInfo {
  id: string;
  name: string;
  type: 'local' | 'online';
  available: boolean;
  description?: string;
  path?: string;
  isLoaded?: boolean;
}

export class WebBridgeService {
  private activeStreams = new Map<string, boolean>();
  private webView: any = null;

  setWebView(webView: any) {
    this.webView = webView;
  }

  async handleBridgeMessage(message: BridgeMessage): Promise<BridgeResponse> {
    try {
      switch (message.method) {
        case 'getModels':
          return await this.handleGetModels(message);
        
        case 'loadModel':
          return await this.handleLoadModel(message);
        
        case 'unloadModel':
          return await this.handleUnloadModel(message);
        
        case 'getCurrentModel':
          return await this.handleGetCurrentModel(message);
        
        case 'chat':
          return await this.handleChat(message);
        
        case 'chatStream':
          return await this.handleChatStream(message);
        
        case 'stopGeneration':
          return await this.handleStopGeneration(message);
        
        case 'getStatus':
          return this.handleGetStatus(message);
        
        default:
          return {
            id: message.id,
            success: false,
            error: `Unknown method: ${message.method}`
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        id: message.id,
        success: false,
        error: errorMessage
      };
    }
  }

  private async handleGetModels(message: BridgeMessage): Promise<BridgeResponse> {
    try {
      const models: ModelInfo[] = [];
      
      const storedModels = await modelDownloader.getStoredModels();
      
      const currentModelPath = llamaManager.getModelPath();
      
      for (const model of storedModels) {
        
        if (model.name.toLowerCase().includes('mmproj') || 
            model.name.toLowerCase().includes('.proj')) {
          continue;
        }
        
        const modelInfo = {
          id: `local-${model.name}`,
          name: model.name,
          type: 'local' as const,
          available: true,
          description: `Local model (${model.size || 'Unknown size'})`,
          path: model.path,
          isLoaded: currentModelPath === model.path
        };
        
        models.push(modelInfo);
      }

      const onlineProviders = [
        { id: 'gemini', name: 'Gemini' },
        { id: 'chatgpt', name: 'ChatGPT' },
        { id: 'deepseek', name: 'DeepSeek' },
        { id: 'claude', name: 'Claude' }
      ];
      
      for (const provider of onlineProviders) {
        const hasKey = await onlineModelService.hasApiKey(provider.id as any);
        const modelName = await onlineModelService.getModelName(provider.id as any) || 
                         onlineModelService.getDefaultModelName(provider.id as any);
        
        const onlineModel = {
          id: provider.id,
          name: `${provider.name} (${modelName})`,
          type: 'online' as const,
          available: hasKey,
          description: `Online ${provider.name} model`,
          isLoaded: false
        };
        
        models.push(onlineModel);
      }

      return {
        id: message.id,
        success: true,
        data: { models }
      };
    } catch (error) {
      return {
        id: message.id,
        success: false,
        error: `Failed to get models: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async handleLoadModel(message: BridgeMessage): Promise<BridgeResponse> {
    try {
      const { modelId, modelPath } = message.data;
      
      if (!modelId) {
        return {
          id: message.id,
          success: false,
          error: 'Model ID is required'
        };
      }

      if (['gemini', 'chatgpt', 'deepseek', 'claude'].includes(modelId)) {
        const hasApiKey = await onlineModelService.hasApiKey(modelId as any);
        if (!hasApiKey) {
          return {
            id: message.id,
            success: false,
            error: `API key required for ${modelId}`
          };
        }
        
        return {
          id: message.id,
          success: true,
          data: { message: `Local model loaded: ${modelPath.split('/').pop()}` }
        };
      }

      return {
        id: message.id,
        success: false,
        error: 'Invalid model ID'
      };
    } catch (error) {
      return {
        id: message.id,
        success: false,
        error: `Failed to load model: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async handleUnloadModel(message: BridgeMessage): Promise<BridgeResponse> {
    try {
      if (llamaManager.isInitialized()) {
        await llamaManager.unloadModel();
      }
      
      return {
        id: message.id,
        success: true,
        data: { message: 'Model unloaded successfully' }
      };
    } catch (error) {
      return {
        id: message.id,
        success: false,
        error: `Failed to unload model: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async handleGetCurrentModel(message: BridgeMessage): Promise<BridgeResponse> {
    try {
      const currentModelPath = llamaManager.getModelPath();
      
      if (!currentModelPath || !llamaManager.isInitialized()) {
        return {
          id: message.id,
          success: true,
          data: { 
            currentModel: null,
            message: 'No model currently loaded'
          }
        };
      }

      return {
        id: message.id,
        success: true,
        data: { 
          currentModel: {
            path: currentModelPath,
            name: currentModelPath.split('/').pop(),
            type: 'local'
          }
        }
      };
    } catch (error) {
      return {
        id: message.id,
        success: false,
        error: `Failed to get current model: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async handleChat(message: BridgeMessage): Promise<BridgeResponse> {
    const { messages, model, temperature, max_tokens } = message.data;

    if (!messages || !Array.isArray(messages)) {
      return {
        id: message.id,
        success: false,
        error: 'Messages array required'
      };
    }

    try {
      let response: string;

      if (!model || model.startsWith('local-')) {
        if (!llamaManager.isInitialized()) {
          return {
            id: message.id,
            success: false,
            error: 'No local model is currently loaded. Please load a model first.'
          };
        }

        response = await this.generateLocalResponse(messages, { temperature, max_tokens });
      } else {
        const provider = model as 'gemini' | 'chatgpt' | 'deepseek' | 'claude';
        const hasApiKey = await onlineModelService.hasApiKey(provider);
        
        if (!hasApiKey) {
          return {
            id: message.id,
            success: false,
            error: `API key not configured for ${provider}`
          };
        }

        response = await this.generateOnlineResponse(messages, provider, { temperature, max_tokens });
      }

      return {
        id: message.id,
        success: true,
        data: {
          choices: [{
            message: {
              role: 'assistant',
              content: response
            },
            finish_reason: 'stop'
          }]
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Generation failed';
      return {
        id: message.id,
        success: false,
        error: errorMessage
      };
    }
  }

  private async handleChatStream(message: BridgeMessage): Promise<BridgeResponse> {
    const { messages, model, temperature, max_tokens } = message.data;
    const streamId = message.id;
    
    this.activeStreams.set(streamId, true);

    try {
      // Handle local models (they start with 'local-')
      if (!model || model.startsWith('local-')) {
        if (!llamaManager.isInitialized()) {
          return {
            id: message.id,
            success: false,
            error: 'No local model is currently loaded. Please load a model first.'
          };
        }
        
        await this.streamLocalResponse(messages, streamId, { temperature, max_tokens });
      } else {
        // Handle online models
        const provider = model as 'gemini' | 'chatgpt' | 'deepseek' | 'claude';
        const hasApiKey = await onlineModelService.hasApiKey(provider);
        
        if (!hasApiKey) {
          return {
            id: message.id,
            success: false,
            error: `API key not configured for ${provider}`
          };
        }

        await this.streamOnlineResponse(messages, provider, streamId, { temperature, max_tokens });
      }

      return {
        id: message.id,
        success: true,
        data: { streaming: true }
      };
    } catch (error) {
      this.activeStreams.delete(streamId);
      const errorMessage = error instanceof Error ? error.message : 'Stream generation failed';
      return {
        id: message.id,
        success: false,
        error: errorMessage
      };
    }
  }

  private async handleStopGeneration(message: BridgeMessage): Promise<BridgeResponse> {
    const { streamId } = message.data;
    
    if (streamId && this.activeStreams.has(streamId)) {
      this.activeStreams.set(streamId, false);
    }

    if (llamaManager.isGenerating()) {
      await llamaManager.cancelGeneration();
    }

    return {
      id: message.id,
      success: true,
      data: { stopped: true }
    };
  }

  private handleGetStatus(message: BridgeMessage): BridgeResponse {
    return {
      id: message.id,
      success: true,
      data: {
        server: 'running',
        local_model: {
          loaded: llamaManager.isInitialized(),
          path: llamaManager.getModelPath(),
          generating: llamaManager.isGenerating()
        },
        platform: 'react-native',
        timestamp: new Date().toISOString()
      }
    };
  }

  private async generateLocalResponse(
    messages: ChatMessage[], 
    options: { temperature?: number; max_tokens?: number } = {}
  ): Promise<string> {
    const settings = llamaManager.getSettings();
    const temperature = options.temperature ?? settings.temperature;
    const maxTokens = options.max_tokens ?? settings.maxTokens;

    await llamaManager.updateSettings({ temperature, maxTokens });

    const processedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    return await llamaManager.generateResponse(processedMessages);
  }

  private async generateOnlineResponse(
    messages: ChatMessage[],
    provider: 'gemini' | 'chatgpt' | 'deepseek' | 'claude',
    options: { temperature?: number; max_tokens?: number } = {}
  ): Promise<string> {
    const requestOptions = {
      temperature: options.temperature,
      maxTokens: options.max_tokens,
      stream: false
    };

    switch (provider) {
      case 'gemini':
        return await onlineModelService.sendMessageToGemini(messages, requestOptions);
      case 'chatgpt':
        return await onlineModelService.sendMessageToOpenAI(messages, requestOptions);
      case 'deepseek':
        return await onlineModelService.sendMessageToDeepSeek(messages, requestOptions);
      case 'claude':
        return await onlineModelService.sendMessageToClaude(messages, requestOptions);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  private async streamLocalResponse(
    messages: ChatMessage[],
    streamId: string,
    options: { temperature?: number; max_tokens?: number } = {}
  ): Promise<void> {
    const settings = llamaManager.getSettings();
    const temperature = options.temperature ?? settings.temperature;
    const maxTokens = options.max_tokens ?? settings.maxTokens;

    await llamaManager.updateSettings({ temperature, maxTokens });

    const processedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const onToken = (token: string) => {
      if (!this.activeStreams.get(streamId)) {
        return false;
      }
      
      this.sendStreamChunk(streamId, token, false);
      return true;
    };

    try {
      await llamaManager.generateResponse(processedMessages, onToken);
      this.sendStreamChunk(streamId, '', true);
      this.activeStreams.delete(streamId);
    } catch (error) {
      this.sendStreamError(streamId, error instanceof Error ? error.message : 'Generation failed');
      this.activeStreams.delete(streamId);
    }
  }

  private async streamOnlineResponse(
    messages: ChatMessage[],
    provider: 'gemini' | 'chatgpt' | 'deepseek' | 'claude',
    streamId: string,
    options: { temperature?: number; max_tokens?: number } = {}
  ): Promise<void> {
    const requestOptions = {
      temperature: options.temperature,
      maxTokens: options.max_tokens,
      stream: true,
      streamTokens: true
    };

    const onToken = (token: string) => {
      if (!this.activeStreams.get(streamId)) {
        return false;
      }
      
      this.sendStreamChunk(streamId, token, false);
      return true;
    };

    try {
      switch (provider) {
        case 'gemini':
          await onlineModelService.sendMessageToGemini(messages, requestOptions, onToken);
          break;
        case 'chatgpt':
          await onlineModelService.sendMessageToOpenAI(messages, requestOptions, onToken);
          break;
        case 'deepseek':
          await onlineModelService.sendMessageToDeepSeek(messages, requestOptions, onToken);
          break;
        case 'claude':
          await onlineModelService.sendMessageToClaude(messages, requestOptions, onToken);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      this.sendStreamChunk(streamId, '', true);
      this.activeStreams.delete(streamId);
    } catch (error) {
      this.sendStreamError(streamId, error instanceof Error ? error.message : 'Generation failed');
      this.activeStreams.delete(streamId);
    }
  }

  private sendStreamChunk(streamId: string, content: string, isLast: boolean) {
    if (this.webView) {
      const chunk = {
        type: 'stream_chunk',
        streamId,
        choices: [{
          delta: { content },
          finish_reason: isLast ? 'stop' : null
        }]
      };
      
      const js = `window.handleStreamChunk && window.handleStreamChunk(${JSON.stringify(chunk)});`;
      this.webView.postMessage(js);
    }
  }

  private sendStreamError(streamId: string, error: string) {
    if (this.webView) {
      const errorChunk = {
        type: 'stream_error',
        streamId,
        error
      };
      
      const js = `window.handleStreamError && window.handleStreamError(${JSON.stringify(errorChunk)});`;
      this.webView.postMessage(js);
    }
  }
}

export const webBridgeService = new WebBridgeService();
