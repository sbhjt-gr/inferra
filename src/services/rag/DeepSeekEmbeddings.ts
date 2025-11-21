import type { Embeddings } from 'react-native-rag';
import { onlineModelService } from '../OnlineModelService';

export class DeepSeekEmbeddings implements Embeddings {
  private loaded = false;
  private apiKey: string | null = null;
  private model: string;

  constructor(model = 'deepseek-embedding') {
    this.model = model;
  }

  async load(): Promise<this> {
    const key = await onlineModelService.getApiKey('deepseek');
    if (!key) {
      throw new Error('rag_deepseek_api_key_missing');
    }
    this.apiKey = key;
    this.loaded = true;
    return this;
  }

  async unload(): Promise<void> {
    this.loaded = false;
    this.apiKey = null;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.loaded || !this.apiKey) {
      throw new Error('Embeddings not loaded');
    }

    const response = await fetch('https://api.deepseek.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(payload.includes('key') ? 'rag_deepseek_embed_denied' : 'rag_deepseek_embed_failed');
    }

    const json = await response.json();
    const vector = json?.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error('rag_deepseek_embed_empty');
    }

    return vector.map((value: number) => Number(value));
  }
}
