import type { Embeddings } from 'react-native-rag';

export class UniversalEmbeddings implements Embeddings {
  private loaded = false;

  async load(): Promise<this> {
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
    const hash = this.simpleHash(text);
    const dimension = 768;
    const vector = new Array(dimension);
    
    for (let i = 0; i < dimension; i++) {
      const seed = hash + i;
      vector[i] = this.seededRandom(seed);
    }
    
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(v => v / magnitude);
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
}
