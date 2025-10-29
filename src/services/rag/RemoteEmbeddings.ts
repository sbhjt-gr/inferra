import type { Embeddings } from 'react-native-rag';
import { onlineModelService } from '../OnlineModelService';
import { llamaManager } from '../../utils/LlamaManager';

const OPENAI_EMBED_MODEL = 'text-embedding-3-large';
const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings';
const DEEPSEEK_EMBED_URL = 'https://api.deepseek.com/v1/embeddings';
const GEMINI_EMBED_MODEL = 'models/textembedding-gecko';

const toArray = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const result: number[] = [];
  for (const item of value) {
    if (typeof item !== 'number') {
      return null;
    }
    result.push(item);
  }
  return result;
};

const sanitize = (text: string): string => {
  if (!text) {
    return '';
  }
  return text.replace(/\s+/g, ' ').trim();
};

type RemoteProvider = 'gemini' | 'chatgpt' | 'deepseek' | 'claude';

export class RemoteEmbeddings implements Embeddings {
  private provider: RemoteProvider;
  private loaded = false;

  constructor(provider: RemoteProvider) {
    this.provider = provider;
  }

  async load(): Promise<this> {
    this.loaded = true;
    return this;
  }

  async unload(): Promise<void> {
    this.loaded = false;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.loaded) {
      throw new Error('embeddings_not_loaded');
    }
    const cleaned = sanitize(text);
    if (!cleaned) {
      throw new Error('empty_embedding_input');
    }
    if (this.provider === 'chatgpt') {
      return this.useOpenAI(cleaned);
    }
    if (this.provider === 'gemini') {
      return this.useGemini(cleaned);
    }
    if (this.provider === 'deepseek') {
      return this.useDeepSeek(cleaned);
    }
    return this.useClaude(cleaned);
  }

  private async useOpenAI(text: string): Promise<number[]> {
    const key = await onlineModelService.getApiKey('chatgpt');
    if (!key || key.length === 0) {
      const local = await this.tryLocal(text);
      if (local) {
        return local;
      }
      throw new Error('openai_embeddings_key_missing');
    }
    const response = await fetch(OPENAI_EMBED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: OPENAI_EMBED_MODEL,
        input: text,
      }),
    });
    if (!response.ok) {
      const local = await this.tryLocal(text);
      if (local) {
        return local;
      }
      throw new Error('openai_embeddings_failed');
    }
    const data = await response.json();
    const embedding = toArray(data?.data?.[0]?.embedding);
    if (!embedding) {
      const local = await this.tryLocal(text);
      if (local) {
        return local;
      }
      throw new Error('openai_embeddings_empty');
    }
    return embedding;
  }

  private async useGemini(text: string): Promise<number[]> {
    const key = await onlineModelService.getApiKey('gemini');
    if (!key || key.length === 0) {
      return this.useOpenAI(text);
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBED_MODEL}:embedContent?key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GEMINI_EMBED_MODEL,
        content: {
          parts: [{ text }],
        },
      }),
    });
    if (!response.ok) {
      return this.useOpenAI(text);
    }
    const data = await response.json();
    const embedding = toArray(data?.embedding?.values);
    if (!embedding) {
      return this.useOpenAI(text);
    }
    return embedding;
  }

  private async useDeepSeek(text: string): Promise<number[]> {
    const key = await onlineModelService.getApiKey('deepseek');
    if (key && key.length > 0) {
      const response = await fetch(DEEPSEEK_EMBED_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: OPENAI_EMBED_MODEL,
          input: text,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const embedding = toArray(data?.data?.[0]?.embedding);
        if (embedding) {
          return embedding;
        }
      }
    }
    try {
      return await this.useOpenAI(text);
    } catch (error) {
      const local = await this.tryLocal(text);
      if (local) {
        return local;
      }
      throw error instanceof Error ? error : new Error('deepseek_embeddings_failed');
    }
  }

  private async useClaude(text: string): Promise<number[]> {
    const claudeKey = await onlineModelService.getApiKey('claude');
    if (claudeKey && claudeKey.length > 0) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': claudeKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'text-embedding-002',
            input: text,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          const embedding = toArray(data?.data?.[0]?.embedding ?? data?.embedding);
          if (embedding) {
            return embedding;
          }
        }
      } catch (_) {
      }
    }
    try {
      return await this.useOpenAI(text);
    } catch (error) {
      const local = await this.tryLocal(text);
      if (local) {
        return local;
      }
      throw error instanceof Error ? error : new Error('claude_embeddings_failed');
    }
  }

  private async tryLocal(text: string): Promise<number[] | null> {
    if (!llamaManager.isInitialized()) {
      return null;
    }
    try {
      const vector = await llamaManager.generateEmbedding(text);
      if (Array.isArray(vector) && vector.length > 0) {
        return vector;
      }
      return null;
    } catch (_) {
      return null;
    }
  }
}
