import { withDatabase } from './ChatDatabase';

const generateRandomId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

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


type Provider = 'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude' | null;

type ChatRow = {
  id: string;
  title: string | null;
  messages: string;
  timestamp: number | string;
  modelPath: string | null;
};

type MetadataRow = {
  value: string;
};

const parseMessages = (value: string): ChatMessage[] => {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed as ChatMessage[];
    }
  } catch (error) {}
  return [];
};

class ChatManager {
  private chats: Chat[] = [];
  private currentChatId: string | null = null;
  private listeners: Set<() => void> = new Set();
  private currentProvider: Provider = null;
  private saveDebounceTimeout: NodeJS.Timeout | null = null;
  private initializationPromise: Promise<void>;

  constructor() {
    this.initializationPromise = this.loadAllChats();
  }

  private async waitForInitialization() {
    try {
      await this.initializationPromise;
    } catch (error) {}
  }

  addListener(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }

  async loadAllChats() {
    try {
      await withDatabase(async db => {
        const rows = await db.getAllAsync<ChatRow>('SELECT id, title, messages, timestamp, modelPath FROM chats');
        const sortedRows = rows.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
        this.chats = sortedRows.map(row => ({
          id: row.id,
          title: row.title ?? 'New Chat',
          messages: parseMessages(row.messages),
          timestamp: Number(row.timestamp),
          modelPath: row.modelPath ?? undefined,
        }));
        const current = await db.getFirstAsync<MetadataRow>('SELECT value FROM metadata WHERE key = ?', ['current_chat_id']);
        this.currentChatId = current?.value ?? null;
      });
      this.notifyListeners();
    } catch (error) {
      this.chats = [];
      this.currentChatId = null;
    }
  }

  private async saveAllChats() {
    await this.waitForInitialization();
    try {
      const nonEmptyChats = this.chats.filter(chat => {
        if (chat.id === this.currentChatId) {
          return true;
        }
        return chat.messages.some(msg => msg.role === 'user' || msg.role === 'assistant');
      });
      await withDatabase(async db => {
        await db.withExclusiveTransactionAsync(async txn => {
          await txn.execAsync('DELETE FROM chats');
          for (const chat of nonEmptyChats) {
            await txn.runAsync(
              'INSERT OR REPLACE INTO chats (id, title, messages, timestamp, modelPath) VALUES (?, ?, ?, ?, ?)',
              [chat.id, chat.title, JSON.stringify(chat.messages), chat.timestamp, chat.modelPath ?? null]
            );
          }
          if (this.currentChatId) {
            await txn.runAsync('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)', ['current_chat_id', this.currentChatId]);
          } else {
            await txn.runAsync('DELETE FROM metadata WHERE key = ?', ['current_chat_id']);
          }
        });
      });
      this.chats = nonEmptyChats;
      if (this.currentChatId && !this.getChatById(this.currentChatId)) {
        this.currentChatId = null;
      }
      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  private async saveCurrentChatId() {
    await this.waitForInitialization();
    await withDatabase(async db => {
      if (this.currentChatId) {
        await db.runAsync('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)', ['current_chat_id', this.currentChatId]);
      } else {
        await db.runAsync('DELETE FROM metadata WHERE key = ?', ['current_chat_id']);
      }
    });
  }

  getAllChats(): Chat[] {
    return [...this.chats].sort((a, b) => b.timestamp - a.timestamp);
  }

  getCurrentChat(): Chat | null {
    if (!this.currentChatId) {
      return null;
    }
    return this.getChatById(this.currentChatId);
  }

  getChatById(id: string): Chat | null {
    return this.chats.find(chat => chat.id === id) ?? null;
  }

  async createNewChat(initialMessages: ChatMessage[] = []): Promise<Chat> {
    await this.waitForInitialization();
    if (this.currentChatId) {
      const currentChat = this.getChatById(this.currentChatId);
      if (currentChat && currentChat.messages.some(msg => msg.role === 'user' || msg.role === 'assistant')) {
        currentChat.timestamp = Date.now();
        await this.saveAllChats();
      }
    }
    const existingEmptyChat = this.chats.find(chat => !chat.messages.some(msg => msg.role === 'user' || msg.role === 'assistant'));
    if (existingEmptyChat) {
      this.currentChatId = existingEmptyChat.id;
      existingEmptyChat.timestamp = Date.now();
      existingEmptyChat.messages = initialMessages;
      await this.saveAllChats();
      await this.saveCurrentChatId();
      return existingEmptyChat;
    }
    const newChat: Chat = {
      id: generateRandomId(),
      title: 'New Chat',
      messages: initialMessages,
      timestamp: Date.now(),
    };
    this.chats.unshift(newChat);
    this.currentChatId = newChat.id;
    await this.saveAllChats();
    await this.saveCurrentChatId();
    return newChat;
  }

  async setCurrentChat(chatId: string): Promise<boolean> {
    await this.waitForInitialization();
    await this.saveCurrentChat();
    const chat = this.getChatById(chatId);
    if (!chat) {
      return false;
    }
    this.currentChatId = chatId;
    await this.saveCurrentChatId();
    await this.saveAllChats();
    this.notifyListeners();
    return true;
  }

  private async saveCurrentChat() {
    await this.waitForInitialization();
    if (!this.currentChatId) {
      return;
    }
    const currentChat = this.getChatById(this.currentChatId);
    if (currentChat) {
      currentChat.timestamp = Date.now();
      await this.saveAllChats();
    }
  }

  async addMessage(message: Omit<ChatMessage, 'id'>): Promise<boolean> {
    await this.waitForInitialization();
    if (!this.currentChatId) {
      return false;
    }
    const currentChat = this.getChatById(this.currentChatId);
    if (!currentChat) {
      return false;
    }
    const newMessage: ChatMessage = {
      ...message,
      id: generateRandomId(),
    };
    currentChat.messages.push(newMessage);
    currentChat.timestamp = Date.now();
    if (message.role === 'user' && currentChat.messages.filter(m => m.role === 'user').length === 1) {
      const now = new Date();
      const dateStr = now.toLocaleDateString();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      currentChat.title = `Chat ${dateStr} ${timeStr}`;
      this.generateTitleForCurrentChat(message.content);
    }
    await this.saveAllChats();
    this.notifyListeners();
    return true;
  }

  private async generateTitleForCurrentChat(userMessage: string): Promise<void> {
    await this.waitForInitialization();
    if (!this.currentChatId) {
      return;
    }
    const currentChat = this.getChatById(this.currentChatId);
    if (!currentChat) {
      return;
    }
    try {
      setTimeout(async () => {
        try {
          const title = await this.generateChatTitle(userMessage);
          const chatToUpdate = this.getChatById(this.currentChatId!);
          if (chatToUpdate && chatToUpdate.messages.filter(m => m.role === 'user').length === 1) {
            chatToUpdate.title = title;
            await this.saveAllChats();
            this.notifyListeners();
          }
        } catch (error) {}
      }, 1000);
    } catch (error) {}
  }

  setCurrentProvider(provider: Provider) {
    this.currentProvider = provider;
  }

  getCurrentProvider(): Provider {
    return this.currentProvider;
  }

  private async generateChatTitle(userMessage: string): Promise<string> {
    try {
      if (this.currentProvider === 'local') {
        const { llamaManager } = await import('./LlamaManager');
        if (llamaManager.isInitialized()) {
          return await llamaManager.generateChatTitle(userMessage);
        }
      } else if (this.currentProvider === 'gemini' || this.currentProvider === 'chatgpt' || this.currentProvider === 'deepseek' || this.currentProvider === 'claude') {
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
      const providers: Exclude<Provider, 'local' | null>[] = ['gemini', 'chatgpt', 'deepseek', 'claude'];
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

  async deleteChat(chatId: string): Promise<boolean> {
    await this.waitForInitialization();
    const index = this.chats.findIndex(chat => chat.id === chatId);
    if (index === -1) {
      return false;
    }
    this.chats.splice(index, 1);
    if (this.currentChatId === chatId) {
      if (this.chats.length > 0) {
        this.currentChatId = this.chats[0].id;
      } else {
        const newChat = await this.createNewChat();
        this.currentChatId = newChat.id;
      }
      await this.saveCurrentChatId();
    }
    await this.saveAllChats();
    this.notifyListeners();
    return true;
  }

  async deleteAllChats(): Promise<boolean> {
    await this.waitForInitialization();
    this.chats = [];
    await withDatabase(async db => {
      await db.withExclusiveTransactionAsync(async txn => {
        await txn.execAsync('DELETE FROM chats');
        await txn.runAsync('DELETE FROM metadata WHERE key = ?', ['current_chat_id']);
      });
    });
    const newChat = await this.createNewChat();
    this.currentChatId = newChat.id;
    await this.saveAllChats();
    await this.saveCurrentChatId();
    this.notifyListeners();
    return true;
  }

  getCurrentChatId(): string | null {
    return this.currentChatId;
  }

  async updateChatMessages(chatId: string, messages: ChatMessage[]): Promise<boolean> {
    await this.waitForInitialization();
    const chat = this.getChatById(chatId);
    if (!chat) {
      return false;
    }
    chat.messages = messages;
    chat.timestamp = Date.now();
    await this.saveAllChats();
    this.notifyListeners();
    return true;
  }

  async updateCurrentChatMessages(messages: ChatMessage[]): Promise<boolean> {
    await this.waitForInitialization();
    if (!this.currentChatId) {
      return false;
    }
    return this.updateChatMessages(this.currentChatId, messages);
  }

  async updateMessageContent(
    messageId: string,
    content: string,
    thinking?: string,
    stats?: { duration: number; tokens: number; firstTokenTime?: number; avgTokenTime?: number }
  ): Promise<boolean> {
    await this.waitForInitialization();
    if (!this.currentChatId) {
      return false;
    }
    const currentChat = this.getChatById(this.currentChatId);
    if (!currentChat) {
      return false;
    }
    const message = currentChat.messages.find(m => m.id === messageId);
    if (!message) {
      return false;
    }
    message.content = content;
    if (thinking !== undefined) {
      message.thinking = thinking;
    }
    if (stats) {
      message.stats = stats;
    }
    this.debouncedSaveAllChats();
    this.notifyListeners();
    return true;
  }

  private async debouncedSaveAllChats() {
    if (this.saveDebounceTimeout) {
      clearTimeout(this.saveDebounceTimeout);
    }
    this.saveDebounceTimeout = setTimeout(async () => {
      await this.saveAllChats();
      this.saveDebounceTimeout = null;
    }, 500);
  }

  async editMessage(messageId: string, newContent: string): Promise<boolean> {
    await this.waitForInitialization();
    if (!this.currentChatId) {
      return false;
    }
    const currentChat = this.getChatById(this.currentChatId);
    if (!currentChat) {
      return false;
    }
    const messageIndex = currentChat.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      return false;
    }
    const message = currentChat.messages[messageIndex];
    if (message.role !== 'user') {
      return false;
    }
    message.content = newContent;
    currentChat.messages = currentChat.messages.slice(0, messageIndex + 1);
    currentChat.timestamp = Date.now();
    await this.saveAllChats();
    this.notifyListeners();
    return true;
  }
}

export const chatManager = new ChatManager();
export default chatManager;