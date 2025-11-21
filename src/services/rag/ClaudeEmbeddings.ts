import type { Embeddings } from 'react-native-rag';
import { onlineModelService } from '../OnlineModelService';

const parseVector = (payload: any): number[] | null => {
  if (Array.isArray(payload)) {
    return payload.map((value: number) => Number(value));
  }
  if (Array.isArray(payload?.values)) {
    return payload.values.map((value: number) => Number(value));
  }
  if (Array.isArray(payload?.data)) {
    return payload.data.map((entry: any) => {
      if (typeof entry === 'number') {
        return Number(entry);
      }
      if (typeof entry?.value === 'number') {
        return Number(entry.value);
      }
      return 0;
    });
  }
  return null;
};

export class ClaudeEmbeddings implements Embeddings {
  private loaded = false;
  private apiKey: string | null = null;
  private model: string;

  constructor(model = 'text-embedding-004') {
    this.model = model;
  }

  async load(): Promise<this> {
    const key = await onlineModelService.getApiKey('claude');
    if (!key) {
      throw new Error('rag_claude_api_key_missing');
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

    const response = await fetch('https://api.anthropic.com/v1/messages/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(payload.includes('key') ? 'rag_claude_embed_denied' : 'rag_claude_embed_failed');
    }

    const json = await response.json();
    const vector = parseVector(json?.embedding);
    if (!vector || vector.length === 0) {
      throw new Error('rag_claude_embed_empty');
    }

    return vector;
  }
}
