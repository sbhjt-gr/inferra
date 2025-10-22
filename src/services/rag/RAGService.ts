import AsyncStorage from '@react-native-async-storage/async-storage';
import { RAG, MemoryVectorStore, type Message } from 'react-native-rag';
import { OPSQLiteVectorStore } from '@react-native-rag/op-sqlite';
import { LlamaRnEmbeddings } from './LlamaRnEmbeddings';
import { LlamaRnLLM } from './LlamaRnLLM';
import type { ModelSettings } from '../ModelSettingsService';

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
      return;
    }

    if (!(await this.isEnabled())) {
      return;
    }

    this.storage = await this.getStorageType();
    this.embeddings = new LlamaRnEmbeddings();
    this.llm = new LlamaRnLLM();

    const vectorStore = this.storage === 'persistent'
      ? new OPSQLiteVectorStore({ name: PERSISTENT_DB_NAME, embeddings: this.embeddings })
      : new MemoryVectorStore({ embeddings: this.embeddings });

    this.rag = new RAG({ vectorStore, llm: this.llm });
    await this.rag.load();
    this.initialized = true;
  }

  async cleanup(): Promise<void> {
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
  }

  isReady(): boolean {
    return this.initialized && this.rag !== null;
  }

  async addDocument(document: RAGDocument): Promise<void> {
    this.ensureReady();

    const timestamp = document.timestamp ?? Date.now();

    const metadataGenerator = (chunks: string[]) =>
      chunks.map((_, index) => ({
        documentId: document.id,
        fileName: document.fileName,
        fileType: document.fileType,
        timestamp,
        chunkIndex: index,
        chunkTotal: chunks.length,
      }));

    await this.rag!.splitAddDocument({
      document: document.content,
      metadataGenerator,
    });
  }

  async generate(params: {
    input: string | Message[];
    settings?: ModelSettings;
    callback?: (token: string) => boolean | void;
    augmentedGeneration?: boolean;
    nResults?: number;
  }): Promise<string> {
    this.ensureReady();

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

    return result;
  }

  async deleteDocument(documentId: string): Promise<void> {
    this.ensureReady();

    await this.rag!.deleteDocument({
      predicate: (value) => value.metadata?.documentId === documentId,
    });
  }

  async clear(): Promise<void> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      await this.cleanup();
      return;
    }

    await this.cleanup();
    await this.initialize();
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
}

export type { RAGDocument, RAGStorageType };
export const RAGService = new RAGServiceClass();
