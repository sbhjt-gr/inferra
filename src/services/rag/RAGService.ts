import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RAG,
  MemoryVectorStore,
  RecursiveCharacterTextSplitter,
  type Message,
  type LLM,
  type Embeddings,
  type QueryResult,
} from 'react-native-rag';
import { OPSQLiteVectorStore } from '@react-native-rag/op-sqlite';
import { LlamaRnEmbeddings } from './LlamaRnEmbeddings';
import { AppleRagEmbeddings } from './AppleRagEmbeddings';
import { OpenAIEmbeddings } from './OpenAIEmbeddings';
import { GeminiEmbeddings } from './GeminiEmbeddings';
import { DeepSeekEmbeddings } from './DeepSeekEmbeddings';
import { ClaudeEmbeddings } from './ClaudeEmbeddings';
import { LlamaRnLLM } from './LlamaRnLLM';
import { OnlineModelLLM } from './OnlineModelLLM';
import { AppleFoundationLLM } from './AppleFoundationLLM';
import type { ModelSettings } from '../ModelSettingsService';
import { llamaManager } from '../../utils/LlamaManager';
import type { ProviderType } from '../ModelManagementService';

const RAG_ENABLED_KEY = '@inferra/rag/enabled';
const RAG_STORAGE_KEY = '@inferra/rag/storage';
const PERSISTENT_DB_NAME = 'inferra_rag_vectors';
const RAG_STATS_KEY = '@inferra/rag/stats';

type RAGStorageType = 'memory' | 'persistent';

type RAGStats = {
  documentCount: number;
  lastIngestedAt: number | null;
};

type RAGDocument = {
  id: string;
  content: string;
  fileName?: string;
  fileType?: string;
  timestamp?: number;
  chatId?: string;
  userId?: string;
  provider?: ProviderType;
};

const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

const sanitizeChunk = (value: string): string => value.replace(CONTROL_CHARS_REGEX, ' ');

class RAGServiceClass {
  private rag: RAG | null = null;
  private embeddings: Embeddings | null = null;
  private llm: LLM | null = null;
  private storage: RAGStorageType = 'memory';
  private initialized = false;
  private currentProvider: ProviderType = 'local';
  private statsLoaded = false;
  private stats: RAGStats = { documentCount: 0, lastIngestedAt: null };

  async isEnabled(): Promise<boolean> {
    const value = await AsyncStorage.getItem(RAG_ENABLED_KEY);
    if (value === null) {
      await AsyncStorage.setItem(RAG_ENABLED_KEY, 'true');
      return true;
    }
    return value === 'true';
  }

  async setEnabled(value: boolean): Promise<void> {
    await AsyncStorage.setItem(RAG_ENABLED_KEY, value ? 'true' : 'false');
    if (!value) {
      await this.cleanup();
    }
  }

  async getStorageType(): Promise<RAGStorageType> {
    const value = await AsyncStorage.getItem(RAG_STORAGE_KEY);
    if (value === null) {
      await AsyncStorage.setItem(RAG_STORAGE_KEY, 'persistent');
      return 'persistent';
    }
    return value === 'persistent' ? 'persistent' : 'memory';
  }

  async setStorageType(type: RAGStorageType): Promise<void> {
    await AsyncStorage.setItem(RAG_STORAGE_KEY, type);
    this.storage = type;
    if (this.initialized) {
      await this.reinitialize();
    }
  }

  async initialize(provider?: ProviderType): Promise<void> {
    const resolvedProvider: ProviderType = provider ?? 'local';
    await this.ensureStatsLoaded();

    if (this.initialized && resolvedProvider === this.currentProvider) {
      console.log('rag_already_initialized', resolvedProvider);
      return;
    }

    if (this.initialized && resolvedProvider !== this.currentProvider) {
      await this.cleanup();
    }

    if (!(await this.isEnabled())) {
      console.log('rag_disabled');
      return;
    }

    console.log('rag_init_start', resolvedProvider);

    const isRemote =
      resolvedProvider === 'gemini' ||
      resolvedProvider === 'chatgpt' ||
      resolvedProvider === 'deepseek' ||
      resolvedProvider === 'claude';
    const isAppleFoundation = resolvedProvider === 'apple-foundation';

    if (!isRemote && !isAppleFoundation) {
      await this.ensureEmbeddingSupport();
      console.log('rag_embeddings_verified');
    }

    this.storage = await this.getStorageType();
    console.log('rag_storage_type', this.storage);

    if (isAppleFoundation) {
      this.embeddings = new AppleRagEmbeddings();
    } else if (isRemote) {
      this.embeddings = this.createRemoteEmbeddings(resolvedProvider);
    } else {
      this.embeddings = new LlamaRnEmbeddings();
    }

    if (isAppleFoundation) {
      this.llm = new AppleFoundationLLM();
    } else if (isRemote) {
      const remoteProvider = resolvedProvider as 'gemini' | 'chatgpt' | 'deepseek' | 'claude';
      this.llm = new OnlineModelLLM(remoteProvider);
    } else {
      this.llm = new LlamaRnLLM();
    }

    this.currentProvider = resolvedProvider;

    let vectorStore: MemoryVectorStore | OPSQLiteVectorStore;
    const createMemoryStore = () => new MemoryVectorStore({ embeddings: this.embeddings! });

    if (this.storage === 'persistent') {
      vectorStore = new OPSQLiteVectorStore({
        name: this.getVectorStoreName(resolvedProvider),
        embeddings: this.embeddings!,
      });
    } else {
      vectorStore = createMemoryStore();
    }

    this.rag = new RAG({ vectorStore, llm: this.llm });
    console.log('rag_loading_vectorstore');

    try {
      await this.rag.load();
    } catch (error) {
      if (this.storage !== 'persistent') {
        throw error;
      }

      console.log('rag_persistent_error', error instanceof Error ? error.message : 'unknown');

      const unloadable = vectorStore as unknown as { unload?: () => Promise<void> };
      if (typeof unloadable.unload === 'function') {
        await unloadable.unload();
      }

      vectorStore = createMemoryStore();
      this.rag = new RAG({ vectorStore, llm: this.llm });
      await AsyncStorage.setItem(RAG_STORAGE_KEY, 'memory');
      this.storage = 'memory';
      console.log('rag_storage_fallback', this.storage);
      await this.rag.load();
    }

    this.initialized = true;
    console.log('rag_init_complete', resolvedProvider);
  }

  async cleanup(options?: { keepProvider?: boolean }): Promise<void> {
    console.log('rag_cleanup_start');
    if (this.rag) {
      await this.rag.unload();
    }

    if (this.llm) {
      await this.llm.unload();
    }

    if (this.embeddings) {
      await this.embeddings.unload();
    }

    this.rag = null;
    this.embeddings = null;
    this.llm = null;
    this.initialized = false;
    if (!options?.keepProvider) {
      this.currentProvider = 'local';
    }
    console.log('rag_cleanup_complete');
  }

  isReady(): boolean {
    return this.initialized && this.rag !== null;
  }

  async addDocument(
    document: RAGDocument,
    options?: {
      onProgress?: (completed: number, total: number) => void;
      isCancelled?: () => boolean;
    }
  ): Promise<void> {
    this.ensureReady();
    console.log('rag_add_doc', document.id);
  await this.ensureStatsLoaded();

    const timestamp = document.timestamp ?? Date.now();
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 100,
    });
    const rawChunks = await splitter.splitText(document.content);
    const sanitized = rawChunks
      .map((chunk, index) => ({
        chunk: sanitizeChunk(chunk),
        rawIndex: index,
      }))
      .filter((entry) => entry.chunk.trim().length > 0);

    const total = sanitized.length;
    const providerTag: ProviderType = document.provider ?? this.currentProvider ?? 'local';

    const prepared = sanitized.map((entry, position) => ({
      chunk: entry.chunk.trim(),
      metadata: {
        documentId: document.id,
        fileName: document.fileName,
        fileType: document.fileType,
        timestamp,
        chunkIndex: position,
        chunkTotal: total,
        chatId: document.chatId,
        userId: document.userId,
        provider: providerTag,
      },
      sourceIndex: entry.rawIndex,
    }));

    if (prepared.length === 0) {
      throw new Error('Document has no embeddable content');
    }

    console.log('rag_chunks_total', document.id, prepared.length);

    const totalChunks = prepared.length;
    options?.onProgress?.(0, totalChunks);

    let added = 0;
    let lastError: unknown = null;

    for (const entry of prepared) {
      if (options?.isCancelled?.()) {
        throw new Error('rag_upload_cancelled');
      }
      try {
        await this.rag!.addDocument({
          document: entry.chunk,
          metadata: entry.metadata,
        });
        added += 1;
        options?.onProgress?.(added, totalChunks);
      } catch (error) {
        lastError = error;
        console.log(
          'rag_chunk_failed',
          document.id,
          entry.sourceIndex,
          error instanceof Error ? error.message : 'unknown'
        );
      }
    }

    if (added === 0) {
      if (lastError instanceof Error) {
        throw lastError;
      }
      throw new Error('Document chunks could not be embedded');
    }

    console.log('rag_doc_added', document.id, added);
    this.stats.documentCount += 1;
    this.stats.lastIngestedAt = timestamp;
    await this.persistStats();
    if (added < totalChunks) {
      options?.onProgress?.(added, totalChunks);
    }
  }

  async generate(params: {
    input: string | Message[];
    settings?: ModelSettings;
    callback?: (token: string) => boolean | void;
    augmentedGeneration?: boolean;
    nResults?: number;
    scope?: {
      chatId?: string | null;
      provider?: ProviderType | null;
    };
  }): Promise<string> {
    this.ensureReady();
    console.log('rag_generate_start');

    const { input, callback, settings, augmentedGeneration = true, nResults = 3, scope } = params;

    if (this.llm && 'setCustomSettings' in this.llm) {
      (this.llm as any).setCustomSettings(settings);
    }

    const result = await this.rag!.generate({
      input,
      augmentedGeneration,
      nResults,
      callback: callback ?? (() => {}),
      predicate: (value: QueryResult) => {
        if (scope?.chatId && value.metadata?.chatId && value.metadata.chatId !== scope.chatId) {
          return false;
        }
        if (scope?.provider && value.metadata?.provider && value.metadata.provider !== scope.provider) {
          return false;
        }
        return true;
      },
    });

    console.log('rag_generate_complete');
    return result;
  }

  async deleteDocument(documentId: string): Promise<void> {
    this.ensureReady();
    console.log('rag_delete_doc', documentId);

    await this.rag!.deleteDocument({
      predicate: (value) => value.metadata?.documentId === documentId,
    });
    console.log('rag_doc_deleted', documentId);
    if (this.stats.documentCount > 0) {
      this.stats.documentCount -= 1;
      await this.persistStats();
    }
  }

  async clear(): Promise<void> {
    console.log('rag_clear_start');
    await this.ensureStatsLoaded();
    const enabled = await this.isEnabled();
    if (!enabled) {
      this.stats = { documentCount: 0, lastIngestedAt: null };
      await this.persistStats();
      await this.cleanup();
      console.log('rag_clear_disabled');
      return;
    }

    const provider = this.currentProvider;

    if (!this.initialized) {
      try {
        await this.initialize(provider);
      } catch (error) {
        console.log('rag_clear_init_failed', error instanceof Error ? error.message : 'unknown');
      }
    }

    if (this.rag) {
      await this.rag.deleteDocument({ predicate: () => true });
    }

    this.stats = { documentCount: 0, lastIngestedAt: null };
    await this.persistStats();

    await this.cleanup({ keepProvider: true });
    await this.initialize(provider);
    console.log('rag_clear_complete');
  }

  async getStatus(): Promise<{
    enabled: boolean;
    storage: RAGStorageType;
    ready: boolean;
    provider: ProviderType;
    documentCount: number;
    lastIngestedAt: number | null;
  }> {
    await this.ensureStatsLoaded();
    return {
      enabled: await this.isEnabled(),
      storage: await this.getStorageType(),
      ready: this.isReady(),
      provider: this.currentProvider,
      documentCount: this.stats.documentCount,
      lastIngestedAt: this.stats.lastIngestedAt,
    };
  }

  private async reinitialize(): Promise<void> {
    const enabled = await this.isEnabled();
    const provider = this.currentProvider;
    await this.cleanup({ keepProvider: true });
    if (enabled) {
      await this.initialize(provider);
    }
  }

  private ensureReady() {
    if (!this.initialized || !this.rag) {
      throw new Error('RAG service not ready');
    }
  }

  private async ensureEmbeddingSupport(): Promise<void> {
    if (!llamaManager.isInitialized()) {
      throw new Error('Model not initialized');
    }

    console.log('rag_verify_embeddings');
    try {
      await llamaManager.generateEmbedding('__rag_probe__');
      console.log('rag_embeddings_ok');
      return;
    } catch (error) {
      console.log('rag_embeddings_failed', error instanceof Error ? error.message : 'unknown');
      const modelPath = llamaManager.getModelPath();
      if (!modelPath) {
        throw error instanceof Error ? error : new Error('Unable to generate embeddings');
      }

      console.log('rag_reload_model');
      const projectorPath = llamaManager.getMultimodalProjectorPath();
      await llamaManager.loadModel(modelPath, projectorPath ?? undefined);
      try {
        await llamaManager.generateEmbedding('__rag_probe__');
        console.log('rag_embeddings_ok_after_reload');
      } catch (finalError) {
        console.log('rag_embeddings_unsupported');
        throw finalError instanceof Error && finalError.message
          ? finalError
          : new Error('Current model does not support embeddings');
      }
    }
  }

  private createRemoteEmbeddings(provider: ProviderType) {
    switch (provider) {
      case 'gemini':
        return new GeminiEmbeddings();
      case 'deepseek':
        return new DeepSeekEmbeddings();
      case 'claude':
        return new ClaudeEmbeddings();
      case 'chatgpt':
      default:
        return new OpenAIEmbeddings();
    }
  }

  private getVectorStoreName(provider: ProviderType) {
    return `${PERSISTENT_DB_NAME}_${provider}`;
  }

  private async ensureStatsLoaded(): Promise<void> {
    if (this.statsLoaded) {
      return;
    }
    try {
      const raw = await AsyncStorage.getItem(RAG_STATS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.documentCount === 'number') {
          this.stats.documentCount = Math.max(0, parsed.documentCount);
        }
        if (typeof parsed.lastIngestedAt === 'number') {
          this.stats.lastIngestedAt = parsed.lastIngestedAt;
        }
      }
    } catch {
      this.stats = { documentCount: 0, lastIngestedAt: null };
    } finally {
      this.statsLoaded = true;
    }
  }

  private async persistStats(): Promise<void> {
    await AsyncStorage.setItem(RAG_STATS_KEY, JSON.stringify(this.stats));
  }
}

export type { RAGDocument, RAGStorageType };
export const RAGService = new RAGServiceClass();
