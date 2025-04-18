import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import EventEmitter from 'eventemitter3';
import { GeminiService } from './GeminiService';

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  thinking?: string;
  stats?: {
    duration: number;
    tokens: number;
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

  setGeminiServiceGetter(getter: () => GeminiService) {
    this._geminiServiceGetter = getter;
  }

  async getApiKey(provider: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(`@${provider}_api_key`);
    } catch (error) {
      console.error(`Error retrieving ${provider} API key:`, error);
      return null;
    }
  }

  async saveApiKey(provider: string, apiKey: string): Promise<boolean> {
    try {
      await AsyncStorage.setItem(`@${provider}_api_key`, apiKey);
      this.events.emit('api-key-updated', provider);
      return true;
    } catch (error) {
      console.error(`Error saving ${provider} API key:`, error);
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
      this.events.emit('api-key-updated', provider);
      return true;
    } catch (error) {
      console.error(`Error clearing ${provider} API key:`, error);
      return false;
    }
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
    
    const geminiOptions = {
      ...options,
      streamTokens: options.streamTokens !== false // Default to true for streaming
    };
    
    const streamEnabled = options.stream === true && typeof onToken === 'function';
    
    console.log(`Gemini API call with streaming: ${streamEnabled}, simulated streaming enabled: ${geminiOptions.streamTokens}`);
    
    const { fullResponse } = await geminiService.generateResponse(
      messages, 
      geminiOptions, 
      streamEnabled ? onToken : undefined
    );
    
    return fullResponse;
  }
}

export const onlineModelService = new OnlineModelService(); 