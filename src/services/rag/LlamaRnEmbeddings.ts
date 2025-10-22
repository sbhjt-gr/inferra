import type { Embeddings } from 'react-native-rag';
import { llamaManager } from '../../utils/LlamaManager';

export class LlamaRnEmbeddings implements Embeddings {
  private loaded = false;

  async load(): Promise<this> {
    if (!llamaManager.isInitialized()) {
      throw new Error('Model not initialized');
    }
    console.log('rag_embeddings_load');
    this.loaded = true;
    return this;
  }

  async unload(): Promise<void> {
    console.log('rag_embeddings_unload');
    this.loaded = false;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.loaded) {
      throw new Error('Embeddings not loaded');
    }

    console.log('rag_embed_start');
    const result = await llamaManager.generateEmbedding(text);
    if (!result || result.length === 0) {
      console.log('rag_embed_empty');
      throw new Error('Empty embedding result');
    }

    console.log('rag_embed_complete', result.length);
    return result;
  }
}
