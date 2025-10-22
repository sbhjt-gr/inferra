import AsyncStorage from '@react-native-async-storage/async-storage';
import { RAG, MemoryVectorStore, RecursiveCharacterTextSplitter, type Message } from 'react-native-rag';
import { OPSQLiteVectorStore } from '@react-native-rag/op-sqlite';
import { LlamaRnEmbeddings } from './LlamaRnEmbeddings';
import { LlamaRnLLM } from './LlamaRnLLM';
import type { ModelSettings } from '../ModelSettingsService';
import { llamaManager } from '../../utils/LlamaManager';

const RAG_ENABLED_KEY = '@inferra/rag/enabled';
const RAG_STORAGE_KEY = '@inferra/rag/storage';
const PERSISTENT_DB_NAME = 'inferra_rag_vectors';

type RAGStorageType = 'memory' | 'persistent';

type RAGDocument = {
  id: string;
  content: string;
  fileName?: string;
  fileType?: string;
  timestamp?: number;
};

const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

const sanitizeChunk = (value: string): string => value.replace(CONTROL_CHARS_REGEX, ' ');

class RAGServiceClass {
  private rag: RAG | null = null;
  private embeddings: LlamaRnEmbeddings | null = null;
  private llm: LlamaRnLLM | null = null;
  private storage: RAGStorageType = 'memory';
  private initialized = false;

  async isEnabled(): Promise<boolean> {
    const value = await AsyncStorage.getItem(RAG_ENABLED_KEY);
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
    return value === 'persistent' ? 'persistent' : 'memory';
  }

  async setStorageType(type: RAGStorageType): Promise<void> {
    await AsyncStorage.setItem(RAG_STORAGE_KEY, type);
    this.storage = type;
    if (this.initialized) {
      await this.reinitialize();
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('rag_already_initialized');
      return;
    }

    if (!(await this.isEnabled())) {
      console.log('rag_disabled');
      return;
    }

    console.log('rag_init_start');
    await this.ensureEmbeddingSupport();
    console.log('rag_embeddings_verified');
    
    this.storage = await this.getStorageType();
    console.log('rag_storage_type', this.storage);
    
    this.embeddings = new LlamaRnEmbeddings();
    this.llm = new LlamaRnLLM();

    let vectorStore: MemoryVectorStore | OPSQLiteVectorStore;
    const createMemoryStore = () => new MemoryVectorStore({ embeddings: this.embeddings! });

    if (this.storage === 'persistent') {
      vectorStore = new OPSQLiteVectorStore({ name: PERSISTENT_DB_NAME, embeddings: this.embeddings });
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
    console.log('rag_init_complete');
  }

  async cleanup(): Promise<void> {
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
    console.log('rag_cleanup_complete');
  }

  isReady(): boolean {
    return this.initialized && this.rag !== null;
  }

  async addDocument(document: RAGDocument): Promise<void> {
    this.ensureReady();
    console.log('rag_add_doc', document.id);

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

    const prepared = sanitized.map((entry, position) => ({
      chunk: entry.chunk.trim(),
      metadata: {
        documentId: document.id,
        fileName: document.fileName,
        fileType: document.fileType,
        timestamp,
        chunkIndex: position,
        chunkTotal: total,
      },
      sourceIndex: entry.rawIndex,
    }));

    if (prepared.length === 0) {
      throw new Error('Document has no embeddable content');
    }

    console.log('rag_chunks_total', document.id, prepared.length);

    let added = 0;
    let lastError: unknown = null;

    for (const entry of prepared) {
      try {
        await this.rag!.addDocument({
          document: entry.chunk,
          metadata: entry.metadata,
        });
        added += 1;
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
  }

  async generate(params: {
    input: string | Message[];
    settings?: ModelSettings;
    callback?: (token: string) => boolean | void;
    augmentedGeneration?: boolean;
    nResults?: number;
  }): Promise<string> {
    this.ensureReady();
    console.log('rag_generate_start');

    const { input, callback, settings, augmentedGeneration = true, nResults = 3 } = params;

    if (this.llm) {
      this.llm.setCustomSettings(settings);
    }

    const result = await this.rag!.generate({
      input,
      augmentedGeneration,
      nResults,
      callback: callback ?? (() => {}),
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
  }

  async clear(): Promise<void> {
    console.log('rag_clear_start');
    const enabled = await this.isEnabled();
    if (!enabled) {
      await this.cleanup();
      console.log('rag_clear_disabled');
      return;
    }

    await this.cleanup();
    await this.initialize();
    console.log('rag_clear_complete');
  }

  private async reinitialize(): Promise<void> {
    const enabled = await this.isEnabled();
    await this.cleanup();
    if (enabled) {
      await this.initialize();
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
}

export type { RAGDocument, RAGStorageType };
export const RAGService = new RAGServiceClass();
