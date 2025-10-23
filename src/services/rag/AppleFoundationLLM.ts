import type { LLM } from 'react-native-rag';
import type { Message } from 'react-native-rag';
import { appleFoundationService } from '../AppleFoundationService';

export class AppleFoundationLLM implements LLM {
  private loaded = false;
  private settings?: any;

  async load(): Promise<this> {
    this.loaded = true;
    return this;
  }

  setCustomSettings(settings?: any) {
    this.settings = settings;
  }

  async interrupt(): Promise<void> {
    appleFoundationService.cancel();
  }

  async unload(): Promise<void> {
    this.loaded = false;
  }

  async generate(messages: Message[], callback: (token: string) => boolean | void = () => {}): Promise<string> {
    if (!this.loaded) {
      throw new Error('llm_not_loaded');
    }

    console.log('apple_rag_generate_start');

    const messageParams = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    const options = {
      temperature: this.settings?.temperature ?? 0.7,
      maxTokens: this.settings?.maxTokens ?? 2048,
      topP: this.settings?.topP ?? 0.9,
      topK: this.settings?.topK ?? 40,
    };

    let fullResponse = '';

    try {
      const stream = appleFoundationService.streamResponse(messageParams, options);

      for await (const chunk of stream) {
        fullResponse += chunk;
        const shouldContinue = callback(chunk);
        if (typeof shouldContinue === 'boolean' && !shouldContinue) {
          appleFoundationService.cancel();
          break;
        }
      }

      console.log('apple_rag_generate_complete');
      return fullResponse;
    } catch (error) {
      console.log('apple_rag_generate_error', error instanceof Error ? error.message : 'unknown');
      throw error;
    }
  }
}
