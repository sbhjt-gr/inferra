import chatDatabase from './ChatDatabase';
import type { ProviderType } from '../services/ModelManagementService';
import { RAGService } from '../services/rag/RAGService';

const generateRandomId = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

export type ChatMessage = {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  thinking?: string;
  stats?: {
    duration: number;
    tokens: number;
    firstTokenTime?: number;
    avgTokenTime?: number;
  };
};

export type Chat = {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: number;
  modelPath?: string;
};

class ChatManager {
  private cache: Chat[] = [];
  private currentChatId: string | null = null;
  private listeners: Set<() => void> = new Set();
  private currentProvider: ProviderType | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private saveDebounceTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.initPromise = this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    try {
      await chatDatabase.initialize();
      this.cache = await chatDatabase.getAllChats();
      this.currentChatId = await chatDatabase.getCurrentChatId();
      this.isInitialized = true;
      this.notifyListeners();
    } catch (error) {
      this.cache = [];
      this.isInitialized = true;
    }
  }

  async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  addListener(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  private async saveChat(chat: Chat): Promise<void> {
    await chatDatabase.insertChat(chat);
    for (const message of chat.messages) {
      await chatDatabase.insertMessage(chat.id, message);
    }
  }

  private async persistCurrentChat(): Promise<void> {
    if (this.currentChatId) {
      await chatDatabase.setCurrentChatId(this.currentChatId);
    }
  }

  getAllChats(): Chat[] {
    const nonEmptyChats = this.cache.filter(chat => chat.messages.length > 0);
    return nonEmptyChats.sort((a, b) => b.timestamp - a.timestamp);
  }

  getCurrentChat(): Chat | null {
    if (!this.currentChatId) return null;
    return this.getChatById(this.currentChatId);
  }

  getChatById(id: string): Chat | null {
    return this.cache.find(chat => chat.id === id) || null;
  }

  getCurrentChatId(): string | null {
    return this.currentChatId;
  }

  async createNewChat(initialMessages: ChatMessage[] = []): Promise<Chat> {
    try {
      await this.ensureInitialized();
      try {
        await RAGService.clear();
      } catch (error) {
        console.log('rag_clear_new_chat_fail', error instanceof Error ? error.message : 'unknown');
      }

      if (this.currentChatId) {
        const currentChat = this.getChatById(this.currentChatId);
        if (currentChat && currentChat.messages.length > 0) {
          currentChat.timestamp = Date.now();
          await this.saveChat(currentChat);
        }
      }

      const existingEmptyChat = this.cache.find(chat => chat.messages.length === 0);

      if (existingEmptyChat) {
        existingEmptyChat.timestamp = Date.now();
        existingEmptyChat.messages = initialMessages;
        this.currentChatId = existingEmptyChat.id;
        await this.persistCurrentChat();
        if (initialMessages.length > 0) {
          await this.saveChat(existingEmptyChat);
        }
        this.notifyListeners();
        return existingEmptyChat;
      }

      const newChat: Chat = {
        id: generateRandomId(),
        title: 'New Chat',
        messages: initialMessages,
        timestamp: Date.now(),
      };

      this.cache.unshift(newChat);
      this.currentChatId = newChat.id;
      await this.persistCurrentChat();
      if (initialMessages.length > 0) {
        await this.saveChat(newChat);
      }
      this.notifyListeners();
      return newChat;
    } catch (error) {
      throw new Error(`Failed to create chat: ${error}`);
    }
  }

  async setCurrentChat(chatId: string): Promise<boolean> {
    try {
      await this.ensureInitialized();

      const chat = this.getChatById(chatId);
      if (!chat) return false;

      const prevChatId = this.currentChatId;
      if (prevChatId) {
        const prevChat = this.getChatById(prevChatId);
        if (prevChat && prevChat.messages.length > 0) {
          prevChat.timestamp = Date.now();
          await this.saveChat(prevChat);
        }
      }

      this.currentChatId = chatId;
      chat.timestamp = Date.now();
      await this.persistCurrentChat();
      if (chat.messages.length > 0) {
        await this.saveChat(chat);
      }
      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  async addMessage(message: Omit<ChatMessage, 'id'>): Promise<boolean> {
    try {
      await this.ensureInitialized();

      if (!this.currentChatId) return false;

      const chat = this.getChatById(this.currentChatId);
      if (!chat) return false;

      const newMessage: ChatMessage = {
        ...message,
        id: generateRandomId(),
      };

      chat.messages.push(newMessage);
      chat.timestamp = Date.now();

      if (message.role === 'user' && chat.messages.filter(m => m.role === 'user').length === 1) {
        const now = new Date();
        const dateStr = now.toLocaleDateString();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        chat.title = `Chat ${dateStr} ${timeStr}`;
        this.generateTitleForCurrentChat(message.content);
      }

      await this.saveChat(chat);
      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  async updateMessageContent(
    messageId: string,
    content: string,
    thinking?: string,
    stats?: { duration: number; tokens: number; firstTokenTime?: number; avgTokenTime?: number }
  ): Promise<boolean> {
    try {
      await this.ensureInitialized();

      if (!this.currentChatId) return false;

      const chat = this.getChatById(this.currentChatId);
      if (!chat) return false;

      const message = chat.messages.find(m => m.id === messageId);
      if (!message) return false;

      message.content = content;
      if (thinking !== undefined) message.thinking = thinking;
      if (stats) message.stats = stats;

      this.debouncedSaveChat();
      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  private debouncedSaveChat(): void {
    if (this.saveDebounceTimeout) {
      clearTimeout(this.saveDebounceTimeout);
    }

    this.saveDebounceTimeout = setTimeout(async () => {
      if (this.currentChatId) {
        const chat = this.getChatById(this.currentChatId);
        if (chat) {
          await this.saveChat(chat);
        }
      }
      this.saveDebounceTimeout = null;
    }, 500);
  }

  async editMessage(messageId: string, newContent: string): Promise<boolean> {
    try {
      await this.ensureInitialized();

      if (!this.currentChatId) return false;

      const chat = this.getChatById(this.currentChatId);
      if (!chat) return false;

      const messageIndex = chat.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return false;

      const message = chat.messages[messageIndex];
      if (message.role !== 'user') return false;

      message.content = newContent;
      chat.messages = chat.messages.slice(0, messageIndex + 1);
      chat.timestamp = Date.now();

      await this.saveChat(chat);
      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  async updateChatMessages(chatId: string, messages: ChatMessage[]): Promise<boolean> {
    try {
      await this.ensureInitialized();

      const chat = this.getChatById(chatId);
      if (!chat) return false;

      chat.messages = messages;
      chat.timestamp = Date.now();

      await this.saveChat(chat);
      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  async updateCurrentChatMessages(messages: ChatMessage[]): Promise<boolean> {
    if (!this.currentChatId) return false;
    return this.updateChatMessages(this.currentChatId, messages);
  }

  async deleteChat(chatId: string): Promise<boolean> {
    try {
      await this.ensureInitialized();

      const index = this.cache.findIndex(chat => chat.id === chatId);
      if (index === -1) return false;

      this.cache.splice(index, 1);
      await chatDatabase.deleteChat(chatId);

      if (this.currentChatId === chatId) {
        if (this.cache.length > 0) {
          this.currentChatId = this.cache[0].id;
        } else {
          const newChat = await this.createNewChat();
          this.currentChatId = newChat.id;
        }
        await this.persistCurrentChat();
      }

      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  async deleteAllChats(): Promise<boolean> {
    try {
      await this.ensureInitialized();

      this.cache = [];
      await chatDatabase.deleteAllChats();

      const newChat = await this.createNewChat();
      this.currentChatId = newChat.id;
      await this.persistCurrentChat();

      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  async setChatTitle(chatId: string, title: string): Promise<boolean> {
    try {
      await this.ensureInitialized();

      const chat = this.getChatById(chatId);
      if (!chat) return false;

      chat.title = title;
      chat.timestamp = Date.now();

      await this.saveChat(chat);
      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  async setChatModelPath(chatId: string, modelPath: string | null): Promise<boolean> {
    try {
      await this.ensureInitialized();

      const chat = this.getChatById(chatId);
      if (!chat) return false;

      chat.modelPath = modelPath || undefined;
      chat.timestamp = Date.now();

      await this.saveChat(chat);
      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  async appendMessages(
    chatId: string,
    entries: Array<Omit<ChatMessage, 'id'> & { id?: string }>
  ): Promise<ChatMessage[]> {
    await this.ensureInitialized();

    const chat = this.getChatById(chatId);
    if (!chat) {
      throw new Error('chat_not_found');
    }

    const created: ChatMessage[] = [];

    for (const entry of entries) {
      const id = typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : generateRandomId();
      const role: ChatMessage['role'] = entry.role === 'assistant' || entry.role === 'system' ? entry.role : 'user';
      const content = typeof entry.content === 'string' ? entry.content : String(entry.content ?? '');
      const thinking = typeof entry.thinking === 'string' ? entry.thinking : undefined;

      let stats: ChatMessage['stats'] | undefined;
      if (entry.stats && typeof entry.stats === 'object') {
        const info = entry.stats;
        if (typeof info.duration === 'number' && typeof info.tokens === 'number') {
          stats = {
            duration: info.duration,
            tokens: info.tokens,
            firstTokenTime: typeof info.firstTokenTime === 'number' ? info.firstTokenTime : undefined,
            avgTokenTime: typeof info.avgTokenTime === 'number' ? info.avgTokenTime : undefined,
          };
        }
      }

      const message: ChatMessage = {
        id,
        role,
        content,
        thinking,
        stats,
      };

      chat.messages.push(message);
      created.push(message);
    }

    chat.timestamp = Date.now();

    await this.saveChat(chat);
    this.notifyListeners();
    return created;
  }

  async updateMessageById(
    chatId: string,
    messageId: string,
    updates: {
      content?: string;
      thinking?: string | null;
      stats?: ChatMessage['stats'] | null;
      role?: ChatMessage['role'];
    }
  ): Promise<boolean> {
    try {
      await this.ensureInitialized();

      const chat = this.getChatById(chatId);
      if (!chat) return false;

      const message = chat.messages.find(item => item.id === messageId);
      if (!message) return false;

      if (updates.content !== undefined) {
        message.content = updates.content;
      }

      if (updates.thinking !== undefined) {
        message.thinking = updates.thinking === null ? undefined : updates.thinking;
      }

      if (updates.role && (updates.role === 'user' || updates.role === 'assistant' || updates.role === 'system')) {
        message.role = updates.role;
      }

      if (updates.stats !== undefined) {
        if (updates.stats === null) {
          delete message.stats;
        } else {
          const info = updates.stats;
          if (info && typeof info.duration === 'number' && typeof info.tokens === 'number') {
          message.stats = {
              duration: info.duration,
              tokens: info.tokens,
              firstTokenTime: typeof info.firstTokenTime === 'number' ? info.firstTokenTime : undefined,
              avgTokenTime: typeof info.avgTokenTime === 'number' ? info.avgTokenTime : undefined,
          };
          }
        }
      }

      chat.timestamp = Date.now();

      await this.saveChat(chat);
      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  async removeMessage(chatId: string, messageId: string): Promise<boolean> {
    try {
      await this.ensureInitialized();

      const chat = this.getChatById(chatId);
      if (!chat) return false;

      const index = chat.messages.findIndex(item => item.id === messageId);
      if (index === -1) return false;

      chat.messages.splice(index, 1);
      chat.timestamp = Date.now();

      await chatDatabase.deleteMessage(messageId);
      await this.saveChat(chat);
      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  async generateTitleForChat(chatId: string, prompt?: string): Promise<string | null> {
    try {
      await this.ensureInitialized();

      const chat = this.getChatById(chatId);
      if (!chat) return null;

      const firstUserMessage = chat.messages.find(message => message.role === 'user');
      const basePrompt = typeof prompt === 'string' && prompt.length > 0 ? prompt : firstUserMessage?.content;
      if (!basePrompt || basePrompt.length === 0) return null;

      const title = await this.generateChatTitle(basePrompt);
      chat.title = title;
      chat.timestamp = Date.now();

      await this.saveChat(chat);
      this.notifyListeners();
      return title;
    } catch (error) {
      return null;
    }
  }

  setCurrentProvider(provider: ProviderType | null): void {
    this.currentProvider = provider;
  }

  getCurrentProvider(): ProviderType | null {
    return this.currentProvider;
  }

  private async generateTitleForCurrentChat(userMessage: string): Promise<void> {
    if (!this.currentChatId) return;

    const chat = this.getChatById(this.currentChatId);
    if (!chat) return;

    try {
      setTimeout(async () => {
        try {
          const title = await this.generateChatTitle(userMessage);
          const chatToUpdate = this.getChatById(this.currentChatId!);
          if (chatToUpdate && chatToUpdate.messages.filter(m => m.role === 'user').length === 1) {
            chatToUpdate.title = title;
            await this.saveChat(chatToUpdate);
            this.notifyListeners();
          }
        } catch (error) {
        }
      }, 1000);
    } catch (error) {
    }
  }

  async generateChatTitle(userMessage: string): Promise<string> {
    try {
      if (this.currentProvider === 'local') {
        const { llamaManager } = await import('./LlamaManager');
        if (llamaManager.isInitialized()) {
          return await llamaManager.generateChatTitle(userMessage);
        }
      } else if (
        this.currentProvider === 'gemini' ||
        this.currentProvider === 'chatgpt' ||
        this.currentProvider === 'deepseek' ||
        this.currentProvider === 'claude'
      ) {
        const { onlineModelService } = await import('../services/OnlineModelService');
        const hasApiKey = await onlineModelService.hasApiKey(this.currentProvider);
        if (hasApiKey) {
          return await onlineModelService.generateChatTitle(userMessage, this.currentProvider);
        }
      }

      const { llamaManager } = await import('./LlamaManager');
      if (llamaManager.isInitialized()) {
        return await llamaManager.generateChatTitle(userMessage);
      }

      const { onlineModelService } = await import('../services/OnlineModelService');
      const providers: ('gemini' | 'chatgpt' | 'deepseek' | 'claude')[] = ['gemini', 'chatgpt', 'deepseek', 'claude'];
      for (const provider of providers) {
        const hasApiKey = await onlineModelService.hasApiKey(provider);
        if (hasApiKey) {
          return await onlineModelService.generateChatTitle(userMessage, provider);
        }
      }

      const now = new Date();
      const dateStr = now.toLocaleDateString();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `Chat ${dateStr} ${timeStr}`;
    } catch (error) {
      const now = new Date();
      const dateStr = now.toLocaleDateString();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `Chat ${dateStr} ${timeStr}`;
    }
  }
}

export const chatManager = new ChatManager();
export default chatManager;
