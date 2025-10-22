import type { LLM, Message } from 'react-native-rag';
import { llamaManager } from '../../utils/LlamaManager';
import type { ModelSettings } from '../ModelSettingsService';

export class LlamaRnLLM implements LLM {
  private loaded = false;
  private pendingSettings: ModelSettings | undefined;

  async load(): Promise<this> {
    if (!llamaManager.isInitialized()) {
      throw new Error('Model not initialized');
    }
    console.log('rag_llm_load');
    this.loaded = true;
    return this;
  }

  setCustomSettings(settings?: ModelSettings) {
    this.pendingSettings = settings;
  }

  async interrupt(): Promise<void> {
    await llamaManager.stopCompletion();
  }

  async unload(): Promise<void> {
    console.log('rag_llm_unload');
    this.loaded = false;
  }

  async generate(messages: Message[], callback: (token: string) => boolean | void = () => {}): Promise<string> {
    if (!this.loaded) {
      throw new Error('LLM not loaded');
    }

    console.log('rag_llm_generate_start');
    const transformed = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    const result = await llamaManager.generateResponse(
      transformed,
      (token) => {
        const shouldContinue = callback(token);
        if (typeof shouldContinue === 'boolean') {
          return shouldContinue;
        }
        return true;
      },
      this.pendingSettings
    );

    this.pendingSettings = undefined;
    console.log('rag_llm_generate_complete');

    return result;
  }
}
