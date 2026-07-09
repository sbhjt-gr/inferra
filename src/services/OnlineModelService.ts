import EventEmitter from 'eventemitter3';
import { GeminiService, type GeminiResponse } from './GeminiService';
import { OpenAIService, type OpenAIResponse } from './OpenAIService';
import { ClaudeService, type ClaudeResponse } from './ClaudeService';
import Constants from 'expo-constants';
import providerKeyStorage from '../utils/ProviderKeyStorage';
import type { Tool, ToolCall } from './tools/ToolRegistry';
import type { GeneratedImage, ImageGenOptions } from './adapters/OpenAIImageAdapter';

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  thinking?: string;
  toolCallId?: string;
  stats?: {
    duration: number;
    tokens: number;
    firstTokenTime?: number;
    avgTokenTime?: number;
  };
}

export interface OnlineModelRequestOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  model?: string;
  stream?: boolean;
  streamTokens?: boolean;
}

interface OnlineModelServiceEvents {
  'api-key-updated': (provider: string) => void;
}

export class OnlineModelService {
  private events = new EventEmitter<OnlineModelServiceEvents>();
  private _geminiServiceGetter: () => GeminiService | null = () => null;
  private _openAIServiceGetter: () => OpenAIService | null = () => null;
  private _claudeServiceGetter: () => ClaudeService | null = () => null;
  private defaultKeys = {
    gemini: Constants.expoConfig?.extra?.GEMINI_API_KEY || '',
    chatgpt: Constants.expoConfig?.extra?.OPENAI_API_KEY || '',
    claude: Constants.expoConfig?.extra?.ANTHROPIC_API_KEY || '',
  };
  private defaultUrls: Record<string, string> = {
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
    chatgpt: 'https://api.openai.com/v1',
    claude: 'https://api.anthropic.com/v1'
  };
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  static getBaseProvider(provider: string): string {
    const idx = provider.indexOf('_clone_');
    return idx !== -1 ? provider.slice(0, idx) : provider;
  }

  static isClone(provider: string): boolean {
    return provider.includes('_clone_');
  }

  setGeminiServiceGetter(getter: () => GeminiService) {
    this._geminiServiceGetter = getter;
  }
  
  setOpenAIServiceGetter(getter: () => OpenAIService) {
    this._openAIServiceGetter = getter;
  }
  
  setClaudeServiceGetter(getter: () => ClaudeService) {
    this._claudeServiceGetter = getter;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;
    if (!this.initPromise) {
      this.initPromise = providerKeyStorage.initialize().then(() => {
        this.isInitialized = true;
      });
    }

    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      this.isInitialized = false;
      throw error;
    }
  }

  async getApiKey(provider: string): Promise<string | null> {
    try {
      await this.ensureInitialized();
      const record = await providerKeyStorage.getEntry(provider);
      if (record?.customKey) {
        return record.customKey;
      }

      const shouldUseDefault = record ? record.useDefault !== 0 : true;
      if (shouldUseDefault) {
        const base = OnlineModelService.getBaseProvider(provider);
        const defaultKey = this.defaultKeys[base as keyof typeof this.defaultKeys];
        if (defaultKey) {
          return defaultKey;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async saveApiKey(provider: string, apiKey: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      await providerKeyStorage.upsertEntry(provider, { customKey: apiKey, useDefault: 0 });
      this.events.emit('api-key-updated', provider);
      return true;
    } catch (error) {
      return false;
    }
  }

  async hasApiKey(provider: string): Promise<boolean> {
    const apiKey = await this.getApiKey(provider);
    return !!apiKey;
  }

  async clearApiKey(provider: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const hasDefault = this.hasDefaultKey(provider);
      await providerKeyStorage.upsertEntry(provider, { customKey: null, useDefault: hasDefault ? 1 : 0 });
      this.events.emit('api-key-updated', provider);
      return true;
    } catch (error) {
      return false;
    }
  }

  async useDefaultKey(provider: string, useDefault: boolean): Promise<boolean> {
    try {
      await this.ensureInitialized();
      if (useDefault) {
        await providerKeyStorage.upsertEntry(provider, { useDefault: 1, customKey: null });
      } else {
        await providerKeyStorage.upsertEntry(provider, { useDefault: 0 });
      }
      this.events.emit('api-key-updated', provider);
      return true;
    } catch (error) {
      return false;
    }
  }

  async isUsingDefaultKey(provider: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const record = await providerKeyStorage.getEntry(provider);
      if (record?.customKey) {
        return false;
      }

      const shouldUseDefault = record ? record.useDefault !== 0 : true;
      const base = OnlineModelService.getBaseProvider(provider);
      return shouldUseDefault && !!this.defaultKeys[base as keyof typeof this.defaultKeys];
    } catch (error) {
      return false;
    }
  }

  hasDefaultKey(provider: string): boolean {
    const base = OnlineModelService.getBaseProvider(provider);
    return !!this.defaultKeys[base as keyof typeof this.defaultKeys];
  }

  async getModelName(provider: string): Promise<string | null> {
    try {
      await this.ensureInitialized();
      const record = await providerKeyStorage.getEntry(provider);
      return record?.modelName || null;
    } catch (error) {
      return null;
    }
  }

  async saveModelName(provider: string, modelName: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      await providerKeyStorage.upsertEntry(provider, { modelName });
      return true;
    } catch (error) {
      return false;
    }
  }

  async clearModelName(provider: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      await providerKeyStorage.upsertEntry(provider, { modelName: null });
      return true;
    } catch (error) {
      return false;
    }
  }

  async getSystemInstruction(provider: string): Promise<string | null> {
    try {
      await this.ensureInitialized();
      const record = await providerKeyStorage.getEntry(provider);
      return record?.systemInstruction || null;
    } catch (error) {
      return null;
    }
  }

  async saveSystemInstruction(provider: string, instruction: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      await providerKeyStorage.upsertEntry(provider, { systemInstruction: instruction });
      return true;
    } catch (error) {
      return false;
    }
  }

  async clearSystemInstruction(provider: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      await providerKeyStorage.upsertEntry(provider, { systemInstruction: null });
      return true;
    } catch (error) {
      return false;
    }
  }

  getDefaultModelName(provider: string): string {
    const base = OnlineModelService.getBaseProvider(provider);
    const defaults: Record<string, string> = {
      gemini: 'gemini-2.5-flash',
      chatgpt: 'gpt-4.1',
      claude: 'claude-sonnet-4-6'
    };
    return defaults[base] || '';
  }

  getDefaultBaseUrl(provider: string): string {
    const base = OnlineModelService.getBaseProvider(provider);
    return this.defaultUrls[base] || '';
  }

  async getBaseUrl(provider: string): Promise<string> {
    try {
      await this.ensureInitialized();
      const customUrl = await this.getCustomBaseUrl(provider);
      if (customUrl) {
        return this.normalizeBaseUrl(customUrl);
      }
      return this.getDefaultBaseUrl(provider);
    } catch (error) {
      return this.getDefaultBaseUrl(provider);
    }
  }

  async getCustomBaseUrl(provider: string): Promise<string | null> {
    try {
      await this.ensureInitialized();
      const record = await providerKeyStorage.getEntry(provider);
      return record?.baseUrl || null;
    } catch (error) {
      return null;
    }
  }

  async saveBaseUrl(provider: string, baseUrl: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const normalized = this.normalizeBaseUrl(baseUrl);
      if (!normalized) {
        await providerKeyStorage.upsertEntry(provider, { baseUrl: null });
      } else {
        await providerKeyStorage.upsertEntry(provider, { baseUrl: normalized });
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async clearBaseUrl(provider: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      await providerKeyStorage.upsertEntry(provider, { baseUrl: null });
      return true;
    } catch (error) {
      return false;
    }
  }

  private normalizeBaseUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
      return '';
    }
    return trimmed.replace(/\/+$/, '');
  }

  addListener(event: keyof OnlineModelServiceEvents, listener: any): () => void {
    this.events.on(event, listener);
    return () => this.events.off(event, listener);
  }

  async listClones(): Promise<{ id: string; displayName: string; baseProvider: string }[]> {
    try {
      await this.ensureInitialized();
      const all = await providerKeyStorage.listAll();
      return all
        .filter(r => OnlineModelService.isClone(r.provider))
        .map(r => ({
          id: r.provider,
          displayName: r.displayName || r.provider,
          baseProvider: OnlineModelService.getBaseProvider(r.provider),
        }));
    } catch {
      return [];
    }
  }

  async createClone(baseProvider: string, displayName: string): Promise<string> {
    await this.ensureInitialized();
    const shortId = Math.random().toString(36).slice(2, 7);
    const cloneId = `${baseProvider}_clone_${shortId}`;
    await providerKeyStorage.upsertEntry(cloneId, { displayName, useDefault: 0 });
    this.events.emit('api-key-updated', cloneId);
    return cloneId;
  }

  async deleteClone(cloneId: string): Promise<void> {
    await this.ensureInitialized();
    await providerKeyStorage.deleteEntry(cloneId);
    this.events.emit('api-key-updated', cloneId);
  }

  async getDisplayName(provider: string): Promise<string | null> {
    try {
      await this.ensureInitialized();
      const record = await providerKeyStorage.getEntry(provider);
      return record?.displayName || null;
    } catch {
      return null;
    }
  }

  async saveDisplayName(provider: string, name: string): Promise<void> {
    await this.ensureInitialized();
    await providerKeyStorage.upsertEntry(provider, { displayName: name });
  }

  async sendMessageToGemini(
    messages: ChatMessage[],
    options: OnlineModelRequestOptions = {},
    onToken?: (token: string) => boolean | void,
    provider = 'gemini'
  ): Promise<string> {
    const geminiService = this._geminiServiceGetter();
    if (!geminiService) {
      throw new Error('GeminiService not initialized');
    }
    
    const configuredModel = await this.getModelName(provider);
    const modelToUse = configuredModel || this.getDefaultModelName(provider);
    
    const geminiOptions = {
      ...options,
      model: options.model || modelToUse,
      streamTokens: options.streamTokens !== false
    };
    
    const streamEnabled = options.stream === true && typeof onToken === 'function';
    
    
    const { fullResponse } = await geminiService.generateResponse(
      messages, 
      geminiOptions, 
      streamEnabled ? onToken : undefined,
      provider
    );
    
    return fullResponse;
  }
  
  async sendMessageToOpenAI(
    messages: ChatMessage[],
    options: OnlineModelRequestOptions = {},
    onToken?: (token: string) => boolean | void,
    provider = 'chatgpt'
  ): Promise<string> {
    const openAIService = this._openAIServiceGetter();
    if (!openAIService) {
      throw new Error('OpenAIService not initialized');
    }
    
    const configuredModel = await this.getModelName(provider);
    const modelToUse = configuredModel || this.getDefaultModelName(provider);
    
    const openAIOptions = {
      ...options,
      model: options.model || modelToUse,
      streamTokens: options.streamTokens !== false
    };
    
    const streamEnabled = options.stream === true && typeof onToken === 'function';
    
    
    const { fullResponse } = await openAIService.generateResponse(
      messages, 
      openAIOptions, 
      streamEnabled ? onToken : undefined,
      provider
    );
    
    return fullResponse;
  }
  
  async sendMessageToClaude(
    messages: ChatMessage[],
    options: OnlineModelRequestOptions = {},
    onToken?: (token: string) => boolean | void,
    provider = 'claude'
  ): Promise<string> {
    const claudeService = this._claudeServiceGetter();
    if (!claudeService) {
      console.log('online_claude_service_missing', { provider });
      throw new Error('ClaudeService not initialized');
    }
    
    const configuredModel = await this.getModelName(provider);
    const modelToUse = configuredModel || this.getDefaultModelName(provider);
    console.log('online_claude_send', {
      provider,
      model: options.model || modelToUse,
      msgCount: messages.length,
      stream: options.stream === true,
    });
    
    const claudeOptions = {
      ...options,
      model: options.model || modelToUse,
      streamTokens: options.streamTokens !== false
    };
    
    const streamEnabled = options.stream === true && typeof onToken === 'function';
    
    
    const { fullResponse } = await claudeService.generateResponse(
      messages, 
      claudeOptions, 
      streamEnabled ? onToken : undefined,
      provider
    );
    console.log('online_claude_done', { provider, textLen: fullResponse.length });
    
    return fullResponse;
  }

  async sendMessage(
    provider: string,
    messages: ChatMessage[],
    options: OnlineModelRequestOptions = {},
    onToken?: (token: string) => boolean | void
  ): Promise<string> {
    const base = OnlineModelService.getBaseProvider(provider);
    switch (base) {
      case 'gemini':
        return this.sendMessageToGemini(messages, options, onToken, provider);
      case 'chatgpt':
        return this.sendMessageToOpenAI(messages, options, onToken, provider);
      case 'claude':
        return this.sendMessageToClaude(messages, options, onToken, provider);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  async sendOpenAIWithTools(
    messages: ChatMessage[],
    tools: Tool[],
    options: OnlineModelRequestOptions = {},
    onToken?: (token: string) => boolean | void,
    provider = 'chatgpt'
  ): Promise<OpenAIResponse> {
    const openAIService = this._openAIServiceGetter();
    if (!openAIService) {
      throw new Error('OpenAIService not initialized');
    }

    const configuredModel = await this.getModelName(provider);
    const modelToUse = configuredModel || this.getDefaultModelName(provider);

    return openAIService.generateResponse(
      messages,
      {
        ...options,
        model: options.model || modelToUse,
        tools,
      },
      onToken,
      provider
    );
  }

  async sendGeminiWithTools(
    messages: ChatMessage[],
    tools: Tool[],
    options: OnlineModelRequestOptions = {},
    onToken?: (token: string) => boolean | void,
    provider = 'gemini'
  ): Promise<GeminiResponse> {
    const geminiService = this._geminiServiceGetter();
    if (!geminiService) {
      throw new Error('GeminiService not initialized');
    }

    const configuredModel = await this.getModelName(provider);
    const modelToUse = configuredModel || this.getDefaultModelName(provider);

    return geminiService.generateResponse(
      messages,
      {
        ...options,
        model: options.model || modelToUse,
        tools,
      },
      onToken,
      provider
    );
  }

  async sendClaudeWithTools(
    messages: ChatMessage[],
    tools: Tool[],
    options: OnlineModelRequestOptions = {},
    onToken?: (token: string) => boolean | void,
    provider = 'claude'
  ): Promise<ClaudeResponse> {
    const claudeService = this._claudeServiceGetter();
    if (!claudeService) {
      console.log('online_claude_tools_service_missing', { provider });
      throw new Error('ClaudeService not initialized');
    }

    const configuredModel = await this.getModelName(provider);
    const modelToUse = configuredModel || this.getDefaultModelName(provider);
    console.log('online_claude_tools_send', {
      provider,
      model: options.model || modelToUse,
      msgCount: messages.length,
      toolCount: tools.length,
    });

    const result = await claudeService.generateResponse(
      messages,
      {
        ...options,
        model: options.model || modelToUse,
        tools,
      },
      onToken,
      provider
    );
    console.log('online_claude_tools_done', {
      provider,
      textLen: result.fullResponse.length,
      toolCalls: result.toolCalls ? result.toolCalls.length : 0,
    });
    return result;
  }

  async generateImage(
    prompt: string,
    options: ImageGenOptions = {},
    provider = 'chatgpt'
  ): Promise<GeneratedImage> {
    const openAIService = this._openAIServiceGetter();
    if (!openAIService) {
      throw new Error('OpenAIService not initialized');
    }
    return openAIService.generateImage(prompt, options, provider);
  }

  async generateChatTitle(userMessage: string, provider: string): Promise<string> {
    const titlePrompt: ChatMessage[] = [
      {
        id: 'system-title',
        role: 'system',
        content: 'Create a 3-6 word title for this conversation. Respond with only the title, no quotes.'
      },
      {
        id: 'user-title',
        role: 'user',
        content: `Title for: "${userMessage.slice(0, 100)}"`
      }
    ];

    const options: OnlineModelRequestOptions = {
      temperature: 0.3,
      maxTokens: 200,
      stream: false,
      streamTokens: false
    };

    try {
      let title = '';

      const base = OnlineModelService.getBaseProvider(provider);
      try {
        title = await this.sendMessage(provider, titlePrompt, options);
      } catch (error) {
        if (base === 'gemini' && error instanceof Error && error.message.includes('token limit')) {
          const now = new Date();
          return `Chat ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        throw error;
      }
      

      const cleanTitle = title.trim().replace(/['"]/g, '').substring(0, 50);
      if (cleanTitle) {
        return cleanTitle;
      }
      
      const now = new Date();
      const dateStr = now.toLocaleDateString();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `Chat ${dateStr} ${timeStr}`;
    } catch (error) {
      const now = new Date();
      const dateStr = now.toLocaleDateString();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `Chat ${dateStr} ${timeStr}`;
    }
  }
}

export const onlineModelService = new OnlineModelService(); 
