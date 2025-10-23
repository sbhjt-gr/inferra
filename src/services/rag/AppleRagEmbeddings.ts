import type { Embeddings } from 'react-native-rag';
import { AppleEmbeddings } from '@react-native-ai/apple';

const resolveLanguage = (value?: string) => {
  if (value && value.length > 0) {
    return value.toLowerCase();
  }
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en';
  const language = locale.split('-')[0];
  return language ? language.toLowerCase() : 'en';
};

export class AppleRagEmbeddings implements Embeddings {
  private loaded = false;
  private language: string;

  constructor(language?: string) {
    this.language = resolveLanguage(language);
  }

  async load(): Promise<this> {
    try {
      await AppleEmbeddings.prepare(this.language);
      this.loaded = true;
    } catch (error) {
      throw new Error('apple_embeddings_unavailable');
    }
    return this;
  }

  async unload(): Promise<void> {
    this.loaded = false;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.loaded) {
      throw new Error('Embeddings not loaded');
    }
    const vectors = await AppleEmbeddings.generateEmbeddings([text], this.language);
    if (!Array.isArray(vectors) || vectors.length === 0 || !Array.isArray(vectors[0]) || vectors[0].length === 0) {
      throw new Error('Empty embedding result');
    }
    return vectors[0];
  }
}
