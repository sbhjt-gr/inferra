import { ChatMessage } from '../utils/ChatManager';
import { llamaManager } from '../utils/LlamaManager';
import { onlineModelService } from './OnlineModelService';
interface ApiRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}
interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
interface ModelInfo {
  id: string;
  name: string;
  type: 'local' | 'online';
  available: boolean;
  description?: string;
}
interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}
interface StreamChunk {
  choices: Array<{
    delta: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
}
export class ApiHandlerService {
  private activeStreams = new Map<string, boolean>();
  async handleRequest(request: ApiRequest): Promise<ApiResponse> {
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;
    const method = request.method.toUpperCase();
    try {
      switch (path) {
        case '/api/models':
          return this.handleModels();
        case '/api/chat':
          if (method === 'POST') {
            return await this.handleChat(request);
          }
          break;
        case '/api/chat/stream':
          if (method === 'POST') {
            return await this.handleChatStream(request);
          }
          break;
        case '/api/chat/stop':
          if (method === 'POST') {
            return await this.handleStopGeneration(request);
          }
          break;
        case '/api/status':
          return this.handleStatus();
        default:
          return this.createErrorResponse(404, 'Not Found');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Internal server error';
      return this.createErrorResponse(500, errorMessage);
    }
    return this.createErrorResponse(405, 'Method Not Allowed');
  }
  private async handleModels(): Promise<ApiResponse> {
    const models: ModelInfo[] = [];
    const localModelPath = llamaManager.getModelPath();
    models.push({
      id: 'local-llama',
      name: localModelPath ? `Local Model (${localModelPath.split('/').pop()})` : 'Local Model',
      type: 'local',
      available: llamaManager.isInitialized(),
      description: 'Local LLAMA model running on device'
    });
    const providers = ['gemini', 'chatgpt', 'deepseek', 'claude'] as const;
    for (const provider of providers) {
      const hasKey = await onlineModelService.hasApiKey(provider);
      const modelName = await onlineModelService.getModelName(provider) || 
                       onlineModelService.getDefaultModelName(provider);
      models.push({
        id: provider,
        name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} (${modelName})`,
        type: 'online',
        available: hasKey,
        description: `Online ${provider} model`
      });
    }
    return this.createSuccessResponse({ models });
  }
  private async handleChat(request: ApiRequest): Promise<ApiResponse> {
    if (!request.body) {
      return this.createErrorResponse(400, 'Request body required');
    }
    const chatRequest: ChatRequest = JSON.parse(request.body);
    const { messages, model = 'local-llama', temperature, max_tokens } = chatRequest;
    if (!messages || !Array.isArray(messages)) {
      return this.createErrorResponse(400, 'Messages array required');
    }
    try {
      let response: string;
      if (model === 'local-llama') {
        if (!llamaManager.isInitialized()) {
          return this.createErrorResponse(400, 'Local model not loaded');
        }
        response = await this.generateLocalResponse(messages, { temperature, max_tokens });
      } else {
        const provider = model as 'gemini' | 'chatgpt' | 'deepseek' | 'claude';
        const hasApiKey = await onlineModelService.hasApiKey(provider);
        if (!hasApiKey) {
          return this.createErrorResponse(400, `API key not configured for ${provider}`);
        }
        response = await this.generateOnlineResponse(messages, provider, { temperature, max_tokens });
      }
      return this.createSuccessResponse({
        choices: [{
          message: {
            role: 'assistant',
            content: response
          },
          finish_reason: 'stop'
        }]
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Generation failed';
      return this.createErrorResponse(500, errorMessage);
    }
  }
  private async handleChatStream(request: ApiRequest): Promise<ApiResponse> {
    if (!request.body) {
      return this.createErrorResponse(400, 'Request body required');
    }
    const chatRequest: ChatRequest = JSON.parse(request.body);
    const { messages, model = 'local-llama', temperature, max_tokens } = chatRequest;
    const streamId = Math.random().toString(36).substring(7);
    this.activeStreams.set(streamId, true);
    const headers = {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Stream-Id': streamId
    };
    try {
      if (model === 'local-llama') {
        if (!llamaManager.isInitialized()) {
          return this.createErrorResponse(400, 'Local model not loaded');
        }
        const streamResponse = await this.streamLocalResponse(messages, streamId, { temperature, max_tokens });
        return {
          status: 200,
          headers,
          body: streamResponse
        };
      } else {
        const provider = model as 'gemini' | 'chatgpt' | 'deepseek' | 'claude';
        const hasApiKey = await onlineModelService.hasApiKey(provider);
        if (!hasApiKey) {
          return this.createErrorResponse(400, `API key not configured for ${provider}`);
        }
        const streamResponse = await this.streamOnlineResponse(messages, provider, streamId, { temperature, max_tokens });
        return {
          status: 200,
          headers,
          body: streamResponse
        };
      }
    } catch (error) {
      this.activeStreams.delete(streamId);
      const errorMessage = error instanceof Error ? error.message : 'Stream generation failed';
      return this.createErrorResponse(500, errorMessage);
    }
  }
  private async handleStopGeneration(request: ApiRequest): Promise<ApiResponse> {
    if (!request.body) {
      return this.createErrorResponse(400, 'Request body required');
    }
    const { streamId } = JSON.parse(request.body);
    if (streamId && this.activeStreams.has(streamId)) {
      this.activeStreams.set(streamId, false);
    }
    if (llamaManager.isGenerating()) {
      await llamaManager.cancelGeneration();
    }
    return this.createSuccessResponse({ stopped: true });
  }
  private handleStatus(): ApiResponse {
    return this.createSuccessResponse({
      server: 'running',
      local_model: {
        loaded: llamaManager.isInitialized(),
        path: llamaManager.getModelPath(),
        generating: llamaManager.isGenerating()
      },
      platform: process.platform || 'unknown',
      timestamp: new Date().toISOString()
    });
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
  ): Promise<string> {
    const settings = llamaManager.getSettings();
    const temperature = options.temperature ?? settings.temperature;
    const maxTokens = options.max_tokens ?? settings.maxTokens;
    await llamaManager.updateSettings({ temperature, maxTokens });
    return new Promise((resolve, reject) => {
      let streamData = '';
      const processedMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      const addStreamChunk = (content: string, isLast = false) => {
        const chunk: StreamChunk = {
          choices: [{
            delta: { content },
            finish_reason: isLast ? 'stop' : null
          }]
        };
        const chunkData = `data: ${JSON.stringify(chunk)}\n\n`;
        streamData += chunkData;
      };
      const onToken = (token: string) => {
        if (!this.activeStreams.get(streamId)) {
          return false;
        }
        addStreamChunk(token);
        return true;
      };
      llamaManager.generateResponse(processedMessages, onToken)
        .then((response) => {
          addStreamChunk('', true);
          streamData += 'data: [DONE]\n\n';
          this.activeStreams.delete(streamId);
          resolve(streamData);
        })
        .catch((error) => {
          this.activeStreams.delete(streamId);
          reject(error);
        });
    });
  }
  private async streamOnlineResponse(
    messages: ChatMessage[],
    provider: 'gemini' | 'chatgpt' | 'deepseek' | 'claude',
    streamId: string,
    options: { temperature?: number; max_tokens?: number } = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let streamData = '';
      const addStreamChunk = (content: string, isLast = false) => {
        const chunk: StreamChunk = {
          choices: [{
            delta: { content },
            finish_reason: isLast ? 'stop' : null
          }]
        };
        const chunkData = `data: ${JSON.stringify(chunk)}\n\n`;
        streamData += chunkData;
      };
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
        addStreamChunk(token);
        return true;
      };
      const generateResponse = async () => {
        try {
          let response: string;
          switch (provider) {
            case 'gemini':
              response = await onlineModelService.sendMessageToGemini(messages, requestOptions, onToken);
              break;
            case 'chatgpt':
              response = await onlineModelService.sendMessageToOpenAI(messages, requestOptions, onToken);
              break;
            case 'deepseek':
              response = await onlineModelService.sendMessageToDeepSeek(messages, requestOptions, onToken);
              break;
            case 'claude':
              response = await onlineModelService.sendMessageToClaude(messages, requestOptions, onToken);
              break;
            default:
              throw new Error(`Unsupported provider: ${provider}`);
          }
          addStreamChunk('', true);
          streamData += 'data: [DONE]\n\n';
          this.activeStreams.delete(streamId);
          resolve(streamData);
        } catch (error) {
          this.activeStreams.delete(streamId);
          reject(error);
        }
      };
      generateResponse();
    });
  }
  private createSuccessResponse(data: any): ApiResponse {
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify(data)
    };
  }
  private createErrorResponse(status: number, message: string): ApiResponse {
    return {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: message })
    };
  }
}
export const apiHandlerService = new ApiHandlerService();
