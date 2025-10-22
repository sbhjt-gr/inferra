import type { Embeddings } from 'react-native-rag';
import { llamaManager } from '../../utils/LlamaManager';

export class LlamaRnEmbeddings implements Embeddings {
  private loaded = false;

  async load(): Promise<this> {
    if (!llamaManager.isInitialized()) {
      throw new Error('Model not initialized');
    }
    this.loaded = true;
    return this;
  }

  async unload(): Promise<void> {
    this.loaded = false;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.loaded) {
      throw new Error('Embeddings not loaded');
    }

    const result = await llamaManager.generateEmbedding(text);
    if (!result || result.length === 0) {
      throw new Error('Empty embedding result');
    }

    return result;
  }
}
