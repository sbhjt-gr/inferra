import type { Embeddings } from 'react-native-rag';
import { onlineModelService } from '../OnlineModelService';

const toModelPath = (name: string) => {
  if (name.startsWith('models/')) {
    return name;
  }
  return `models/${name}`;
};

export class GeminiEmbeddings implements Embeddings {
  private loaded = false;
  private apiKey: string | null = null;
  private model: string;

  constructor(model = 'text-embedding-004') {
    this.model = model;
  }

  async load(): Promise<this> {
    const key = await onlineModelService.getApiKey('gemini');
    if (!key) {
      throw new Error('rag_gemini_api_key_missing');
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

    const modelPath = toModelPath(this.model);
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:embedContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelPath,
        content: {
          parts: [{ text }],
        },
      }),
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(payload.includes('key') ? 'rag_gemini_embed_denied' : 'rag_gemini_embed_failed');
    }

    const json = await response.json();
    const vector = json?.embedding?.values || json?.embedding || json?.embeddings?.[0]?.values;
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error('rag_gemini_embed_empty');
    }

    return vector.map((value: number) => Number(value));
  }
}
