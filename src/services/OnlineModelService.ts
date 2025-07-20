import AsyncStorage from '@react-native-async-storage/async-storage';
import EventEmitter from 'eventemitter3';
import { GeminiService } from './GeminiService';
import { OpenAIService } from './OpenAIService';
import { DeepSeekService } from './DeepSeekService';
import { ClaudeService } from './ClaudeService';
import Constants from 'expo-constants';

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  thinking?: string;
  stats?: {
    duration: number;
    tokens: number;
  };
  aiSource?: {
    type: 'local' | 'remote' | 'ocr';
    modelName?: string;
    provider?: string;
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

class OnlineModelService {
  private events = new EventEmitter<OnlineModelServiceEvents>();
  private _geminiServiceGetter: () => GeminiService | null = () => null;
  private _openAIServiceGetter: () => OpenAIService | null = () => null;
  private _deepSeekServiceGetter: () => DeepSeekService | null = () => null;
  private _claudeServiceGetter: () => ClaudeService | null = () => null;
  private defaultKeys = {
    gemini: Constants.expoConfig?.extra?.GEMINI_API_KEY || '',
    chatgpt: Constants.expoConfig?.extra?.OPENAI_API_KEY || '',
    deepseek: Constants.expoConfig?.extra?.DEEPSEEK_API_KEY || '',
    claude: Constants.expoConfig?.extra?.ANTHROPIC_API_KEY || '',
  };

  setGeminiServiceGetter(getter: () => GeminiService) {
    this._geminiServiceGetter = getter;
  }
  
  setOpenAIServiceGetter(getter: () => OpenAIService) {
    this._openAIServiceGetter = getter;
  }
  
  setDeepSeekServiceGetter(getter: () => DeepSeekService) {
    this._deepSeekServiceGetter = getter;
  }
  
  setClaudeServiceGetter(getter: () => ClaudeService) {
    this._claudeServiceGetter = getter;
  }

  async getApiKey(provider: string): Promise<string | null> {
    try {
      const customKey = await AsyncStorage.getItem(`@${provider}_api_key`);
      if (customKey) {
        return customKey;
      }
      
      const useDefaultKey = await AsyncStorage.getItem(`@${provider}_use_default`);
      if (useDefaultKey !== 'false') {
        const defaultKey = this.defaultKeys[provider as keyof typeof this.defaultKeys];
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
      await AsyncStorage.setItem(`@${provider}_api_key`, apiKey);
      await AsyncStorage.setItem(`@${provider}_use_default`, 'false');
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
      await AsyncStorage.removeItem(`@${provider}_api_key`);
      if (this.defaultKeys[provider as keyof typeof this.defaultKeys]) {
        await AsyncStorage.setItem(`@${provider}_use_default`, 'true');
      } else {
        await AsyncStorage.removeItem(`@${provider}_use_default`);
      }
      this.events.emit('api-key-updated', provider);
      return true;
    } catch (error) {
      return false;
    }
  }

  async useDefaultKey(provider: string, useDefault: boolean): Promise<boolean> {
    try {
      if (useDefault) {
        await AsyncStorage.setItem(`@${provider}_use_default`, 'true');
        await AsyncStorage.removeItem(`@${provider}_api_key`);
      } else {
        await AsyncStorage.setItem(`@${provider}_use_default`, 'false');
      }
      this.events.emit('api-key-updated', provider);
      return true;
    } catch (error) {
      return false;
    }
  }

  async isUsingDefaultKey(provider: string): Promise<boolean> {
    try {
      const customKey = await AsyncStorage.getItem(`@${provider}_api_key`);
      if (customKey) {
        return false;
      }
      
      const useDefaultKey = await AsyncStorage.getItem(`@${provider}_use_default`);
      return useDefaultKey !== 'false' && !!this.defaultKeys[provider as keyof typeof this.defaultKeys];
    } catch (error) {
      return false;
    }
  }

  hasDefaultKey(provider: string): boolean {
    return !!this.defaultKeys[provider as keyof typeof this.defaultKeys];
  }

  async getModelName(provider: string): Promise<string | null> {
    try {
      const modelName = await AsyncStorage.getItem(`@${provider}_model_name`);
      return modelName;
    } catch (error) {
      return null;
    }
  }

  async saveModelName(provider: string, modelName: string): Promise<boolean> {
    try {
      await AsyncStorage.setItem(`@${provider}_model_name`, modelName);
      return true;
    } catch (error) {
      return false;
    }
  }

  async clearModelName(provider: string): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(`@${provider}_model_name`);
      return true;
    } catch (error) {
      return false;
    }
  }

  getDefaultModelName(provider: string): string {
    const defaults: Record<string, string> = {
      gemini: 'gemini-2.5-flash-preview-05-20',
      chatgpt: 'gpt-4o',
      deepseek: 'deepseek-reasoner',
      claude: 'claude-opus-4-20250514'
    };
    return defaults[provider] || '';
  }

  addListener(event: keyof OnlineModelServiceEvents, listener: any): () => void {
    this.events.on(event, listener);
    return () => this.events.off(event, listener);
  }

  async sendMessageToGemini(
    messages: ChatMessage[],
    options: OnlineModelRequestOptions = {},
    onToken?: (token: string) => boolean | void
  ): Promise<string> {
    const geminiService = this._geminiServiceGetter();
    if (!geminiService) {
      throw new Error('GeminiService not initialized');
    }
    
    const configuredModel = await this.getModelName('gemini');
    const modelToUse = configuredModel || this.getDefaultModelName('gemini');
    
    const geminiOptions = {
      ...options,
      model: options.model || modelToUse,
      streamTokens: options.streamTokens !== false
    };
    
    const streamEnabled = options.stream === true && typeof onToken === 'function';
    
    
    const { fullResponse } = await geminiService.generateResponse(
      messages, 
      geminiOptions, 
      streamEnabled ? onToken : undefined
    );
    
    return fullResponse;
  }
  
  async sendMessageToOpenAI(
    messages: ChatMessage[],
    options: OnlineModelRequestOptions = {},
    onToken?: (token: string) => boolean | void
  ): Promise<string> {
    const openAIService = this._openAIServiceGetter();
    if (!openAIService) {
      throw new Error('OpenAIService not initialized');
    }
    
    const configuredModel = await this.getModelName('chatgpt');
    const modelToUse = configuredModel || this.getDefaultModelName('chatgpt');
    
    const openAIOptions = {
      ...options,
      model: options.model || modelToUse,
      streamTokens: options.streamTokens !== false
    };
    
    const streamEnabled = options.stream === true && typeof onToken === 'function';
    
    
    const { fullResponse } = await openAIService.generateResponse(
      messages, 
      openAIOptions, 
      streamEnabled ? onToken : undefined
    );
    
    return fullResponse;
  }
  
  async sendMessageToDeepSeek(
    messages: ChatMessage[],
    options: OnlineModelRequestOptions = {},
    onToken?: (token: string) => boolean | void
  ): Promise<string> {
    const deepSeekService = this._deepSeekServiceGetter();
    if (!deepSeekService) {
      throw new Error('DeepSeekService not initialized');
    }
    
    const configuredModel = await this.getModelName('deepseek');
    const modelToUse = configuredModel || this.getDefaultModelName('deepseek');
    
    const deepSeekOptions = {
      ...options,
      model: options.model || modelToUse,
      streamTokens: options.streamTokens !== false
    };
    
    const streamEnabled = options.stream === true && typeof onToken === 'function';
    
    
    const { fullResponse } = await deepSeekService.generateResponse(
      messages, 
      deepSeekOptions, 
      streamEnabled ? onToken : undefined
    );
    
    return fullResponse;
  }
  
  async sendMessageToClaude(
    messages: ChatMessage[],
    options: OnlineModelRequestOptions = {},
    onToken?: (token: string) => boolean | void
  ): Promise<string> {
    const claudeService = this._claudeServiceGetter();
    if (!claudeService) {
      throw new Error('ClaudeService not initialized');
    }
    
    const configuredModel = await this.getModelName('claude');
    const modelToUse = configuredModel || this.getDefaultModelName('claude');
    
    const claudeOptions = {
      ...options,
      model: options.model || modelToUse,
      streamTokens: options.streamTokens !== false
    };
    
    const streamEnabled = options.stream === true && typeof onToken === 'function';
    
    
    const { fullResponse } = await claudeService.generateResponse(
      messages, 
      claudeOptions, 
      streamEnabled ? onToken : undefined
    );
    
    return fullResponse;
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
      
      console.log(`[OnlineModelService] Generating chat title using ${provider}`);
      
      switch (provider) {
        case 'gemini':
          try {
            title = await this.sendMessageToGemini(titlePrompt, options);
          } catch (error) {
            if (error instanceof Error && error.message.includes('token limit')) {
              console.warn('[OnlineModelService] Gemini title generation failed due to token limit, using simple title');
              const now = new Date();
              const dateStr = now.toLocaleDateString();
              const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return `Chat ${dateStr} ${timeStr}`;
            }
            throw error;
          }
          break;
        case 'chatgpt':
          title = await this.sendMessageToOpenAI(titlePrompt, options);
          break;
        case 'deepseek':
          title = await this.sendMessageToDeepSeek(titlePrompt, options);
          break;
        case 'claude':
          title = await this.sendMessageToClaude(titlePrompt, options);
          break;
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
      
      console.log(`[OnlineModelService] Generated title: "${title}"`);

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