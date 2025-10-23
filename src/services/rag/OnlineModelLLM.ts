import type { LLM } from 'react-native-rag';
import type { Message } from 'react-native-rag';
import { onlineModelService } from '../OnlineModelService';
import type { ProviderType } from '../ModelManagementService';

export class OnlineModelLLM implements LLM {
  private provider: 'gemini' | 'chatgpt' | 'deepseek' | 'claude';
  private loaded = false;
  private settings?: any;

  constructor(provider: 'gemini' | 'chatgpt' | 'deepseek' | 'claude') {
    this.provider = provider;
  }

  async load(): Promise<this> {
    this.loaded = true;
    return this;
  }

  setCustomSettings(settings?: any) {
    this.settings = settings;
  }

  async interrupt(): Promise<void> {
  }

  async unload(): Promise<void> {
    this.loaded = false;
  }

  async generate(messages: Message[], callback: (token: string) => boolean | void = () => {}): Promise<string> {
    if (!this.loaded) {
      throw new Error('llm_not_loaded');
    }

    console.log('online_rag_generate_start', this.provider);

    const messageParams = messages.map(msg => ({
      id: Math.random().toString(36).substring(7),
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));

    const apiParams = {
      temperature: this.settings?.temperature ?? 0.7,
      maxTokens: this.settings?.maxTokens ?? 2048,
      topP: this.settings?.topP ?? 0.9,
      stream: true,
      streamTokens: true,
    };

    let fullResponse = '';
    
    const streamCallback = (partialResponse: string) => {
      const newTokens = partialResponse.slice(fullResponse.length);
      fullResponse = partialResponse;
      
      if (newTokens) {
        const shouldContinue = callback(newTokens);
        if (typeof shouldContinue === 'boolean' && !shouldContinue) {
          return false;
        }
      }
      return true;
    };

    try {
      switch (this.provider) {
        case 'gemini':
          await onlineModelService.sendMessageToGemini(messageParams, apiParams, streamCallback);
          break;
        case 'chatgpt':
          await onlineModelService.sendMessageToOpenAI(messageParams, apiParams, streamCallback);
          break;
        case 'deepseek':
          await onlineModelService.sendMessageToDeepSeek(messageParams, apiParams, streamCallback);
          break;
        case 'claude':
          await onlineModelService.sendMessageToClaude(messageParams, apiParams, streamCallback);
          break;
      }

      console.log('online_rag_generate_complete', this.provider);
      return fullResponse;
    } catch (error) {
      console.log('online_rag_generate_error', this.provider, error instanceof Error ? error.message : 'unknown');
      throw error;
    }
  }
}
