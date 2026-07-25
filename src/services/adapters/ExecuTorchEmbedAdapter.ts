import type { Embeddings } from 'react-native-rag';
import { ExecuTorchEmbeddings } from '@react-native-rag/executorch';

type EmbedSources = {
  modelSource: string;
  tokenizerSource: string;
};

export class ExecuTorchEmbedAdapter implements Embeddings {
  private inner: ExecuTorchEmbeddings;
  private loaded = false;

  constructor(sources: EmbedSources) {
    console.log('et_embed_create');
    this.inner = new ExecuTorchEmbeddings({
      modelSource: sources.modelSource,
      tokenizerSource: sources.tokenizerSource,
      onDownloadProgress: () => {},
    });
  }

  async load(): Promise<this> {
    if (this.loaded) {
      return this;
    }
    console.log('et_embed_load');
    await this.inner.load();
    this.loaded = true;
    console.log('et_embed_ready');
    return this;
  }

  async unload(): Promise<void> {
    console.log('et_embed_unload');
    await this.inner.unload();
    this.loaded = false;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.loaded) {
      throw new Error('embeddings_not_loaded');
    }
    console.log('et_embed_start');
    const vector = await this.inner.embed(text);
    if (!vector || vector.length === 0) {
      console.log('et_embed_empty');
      throw new Error('empty_embedding');
    }
    console.log('et_embed_done', vector.length);
    return vector;
  }
}
