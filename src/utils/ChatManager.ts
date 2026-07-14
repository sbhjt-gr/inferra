import chatDatabase from './ChatDatabase';
import type { ProviderType } from '../services/ModelManagementService';
import { RAGService } from '../services/rag/RAGService';
import { engineService } from '../services/runtime-service';
import type { SkillActivityStep } from '../types/skillActivity';

const generateRandomId = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

export type ChatMessage = {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  modelName?: string;
  thinking?: string;
  stats?: {
    duration: number;
    tokens: number;
    firstTokenTime?: number;
    avgTokenTime?: number;
  };
  skillSteps?: SkillActivityStep[];
};

export type Chat = {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: number;
  createdAt: number;
  modelPath?: string;
  parentChatId?: string;
  branchFromMsgId?: string;
  branchPointIndex?: number;
  forkedFromChatId?: string;
  forkPointIndex?: number;
  pinned?: boolean;
};

class ChatManager {
  private cache: Chat[] = [];
  private currentChatId: string | null = null;
  private listeners: Set<() => void> = new Set();
  private currentProvider: ProviderType | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private saveDebounceTimeout: NodeJS.Timeout | null = null;
  private isLoadingChat = false;
  private pendingSaves: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.initPromise = this.initializeDatabase();
  }

  isCurrentlyLoadingChat(): boolean {
    return this.isLoadingChat;
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
    const nonEmptyChats = this.cache.filter(chat => chat.messages.length > 0 && !chat.forkedFromChatId);
    return nonEmptyChats.sort((a, b) => b.timestamp - a.timestamp);
  }

  getRootChats(): Chat[] {
    return this.cache
      .filter(chat => chat.messages.length > 0 && !chat.parentChatId && !chat.forkedFromChatId)
      .sort((a, b) => {
        const aPinned = a.pinned ? 1 : 0;
        const bPinned = b.pinned ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        const aLatest = this.getLatestBranchTimestamp(a.id);
        const bLatest = this.getLatestBranchTimestamp(b.id);
        return bLatest - aLatest;
      });
  }

  async togglePin(chatId: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const chat = this.getChatById(chatId);
      if (!chat) return false;
      chat.pinned = !chat.pinned;
      await this.saveChat(chat);
      this.notifyListeners();
      return true;
    } catch {
      return false;
    }
  }

  private getLatestBranchTimestamp(rootId: string): number {
    const root = this.getChatById(rootId);
    let latest = root?.timestamp ?? 0;
    for (const c of this.cache) {
      if ((c.parentChatId === rootId || c.forkedFromChatId === rootId) && c.timestamp > latest) {
        latest = c.timestamp;
      }
    }
    return latest;
  }

  getLatestBranch(rootId: string): Chat | null {
    const root = this.getChatById(rootId);
    if (!root) return null;
    const related = this.cache.filter(c => c.parentChatId === rootId || c.forkedFromChatId === rootId);
    if (related.length === 0) return root;
    related.sort((a, b) => b.timestamp - a.timestamp);
    return related[0].timestamp >= root.timestamp ? related[0] : root;
  }

  getBranchCount(rootId: string): number {
    return this.cache.filter(c => c.parentChatId === rootId).length;
  }

  getForkInfo(
    chatId: string,
  ): Map<number, { total: number; current: number; forks: string[] }> {
    const result = new Map<
      number,
      { total: number; current: number; forks: string[] }
    >();
    const chat = this.getChatById(chatId);
    if (!chat) return result;

    const originId = chat.forkedFromChatId ?? chatId;
    const forkIdx = chat.forkPointIndex;

    const allForks = this.cache.filter(
      c => c.forkedFromChatId === originId,
    );

    const pointMap = new Map<number, string[]>();
    for (const f of allForks) {
      if (f.forkPointIndex === undefined) continue;
      if (!pointMap.has(f.forkPointIndex)) {
        pointMap.set(f.forkPointIndex, []);
      }
      pointMap.get(f.forkPointIndex)!.push(f.id);
    }

    for (const [idx, forkIds] of pointMap) {
      const siblings = [originId, ...forkIds.sort((a, b) => {
        const ca = this.getChatById(a);
        const cb = this.getChatById(b);
        return (ca?.createdAt ?? 0) - (cb?.createdAt ?? 0);
      })];
      if (siblings.length < 2) continue;

      const currentIdx = siblings.indexOf(chatId);
      if (currentIdx === -1 && chatId !== originId) continue;

      result.set(idx, {
        total: siblings.length,
        current: currentIdx === -1 ? 0 : currentIdx,
        forks: siblings,
      });
    }

    if (
      chat.forkedFromChatId &&
      forkIdx !== undefined &&
      !result.has(forkIdx)
    ) {
      const siblingsForThis = [originId];
      const related = this.cache.filter(
        c => c.forkedFromChatId === originId && c.forkPointIndex === forkIdx,
      );
      related.sort((a, b) => a.createdAt - b.createdAt);
      for (const r of related) {
        siblingsForThis.push(r.id);
      }
      if (siblingsForThis.length > 1) {
        const ci = siblingsForThis.indexOf(chatId);
        result.set(forkIdx, {
          total: siblingsForThis.length,
          current: ci === -1 ? 0 : ci,
          forks: siblingsForThis,
        });
      }
    }

    return result;
  }

  async forkChat(fromMsgIndex: number): Promise<Chat | null> {
    try {
      await this.ensureInitialized();
      if (!this.currentChatId) return null;

      const chat = this.getChatById(this.currentChatId);
      if (!chat) return null;
      if (fromMsgIndex < 0 || fromMsgIndex >= chat.messages.length) return null;

      const originId = chat.forkedFromChatId ?? this.currentChatId!;

      const copiedMsgs = chat.messages.slice(0, fromMsgIndex + 1).map(m => ({
        ...m,
        id: generateRandomId(),
      }));

      const now = Date.now();
      const fork: Chat = {
        id: generateRandomId(),
        title: chat.title,
        messages: copiedMsgs,
        timestamp: now,
        createdAt: now,
        modelPath: chat.modelPath,
        forkedFromChatId: originId,
        forkPointIndex: fromMsgIndex,
      };

      this.cache.unshift(fork);
      this.currentChatId = fork.id;
      await this.persistCurrentChat();
      await this.saveChat(fork);
      this.notifyListeners();
      return fork;
    } catch (error) {
      return null;
    }
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
      engineService.stop();
      await engineService.resetChatSession();

      await this.ensureInitialized();
      
      if (this.isLoadingChat) {
        const currentChat = this.getCurrentChat();
        if (currentChat) return currentChat;
      }
      
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

      const now = Date.now();
      const newChat: Chat = {
        id: generateRandomId(),
        title: 'New Chat',
        messages: initialMessages,
        timestamp: now,
        createdAt: now,
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

  async setCurrentChat(chatId: string, skipNotify: boolean = false): Promise<boolean> {
    try {
      await this.ensureInitialized();
      
      this.isLoadingChat = true;

      const chat = this.getChatById(chatId);
      if (!chat) {
        this.isLoadingChat = false;
        return false;
      }

      const prevChatId = this.currentChatId;
      if (prevChatId && prevChatId !== chatId) {
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
      
      this.isLoadingChat = false;
      
      if (!skipNotify) {
        this.notifyListeners();
      }
      return true;
    } catch (error) {
      this.isLoadingChat = false;
      return false;
    }
  }

  async addMessage(message: Omit<ChatMessage, 'id'>): Promise<boolean> {
    try {
      await this.ensureInitialized();

      if (!this.currentChatId) {
        return false;
      }

      const chat = this.getChatById(this.currentChatId);
      if (!chat) {
        return false;
      }

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
      console.log('chatmanager_add_error', error instanceof Error ? error.message : 'unknown');
      return false;
    }
  }

  async updateMessageContent(
    messageId: string,
    content: string,
    thinking?: string,
    stats?: { duration: number; tokens: number; firstTokenTime?: number; avgTokenTime?: number },
    skillSteps?: SkillActivityStep[],
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
      if (skillSteps) message.skillSteps = skillSteps;

      this.debouncedSaveChat(this.currentChatId);
      return true;
    } catch (error) {
      return false;
    }
  }

  private debouncedSaveChat(chatId: string): void {
    const existingTimeout = this.pendingSaves.get(chatId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      const chat = this.getChatById(chatId);
      if (chat) {
        await this.saveChat(chat);
      }
      this.pendingSaves.delete(chatId);
    }, 300);
    
    this.pendingSaves.set(chatId, timeout);
  }

  async flushPendingSaves(): Promise<void> {
    const savePromises: Promise<void>[] = [];
    
    for (const [chatId, timeout] of this.pendingSaves) {
      clearTimeout(timeout);
      const chat = this.getChatById(chatId);
      if (chat) {
        savePromises.push(this.saveChat(chat));
      }
    }
    
    this.pendingSaves.clear();
    await Promise.all(savePromises);
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

  async createBranch(messageId: string, newContent: string): Promise<Chat | null> {
    try {
      await this.ensureInitialized();
      if (!this.currentChatId) return null;

      const chat = this.getChatById(this.currentChatId);
      if (!chat) return null;

      const msgIndex = chat.messages.findIndex(m => m.id === messageId);
      if (msgIndex === -1) return null;
      if (chat.messages[msgIndex].role !== 'user') return null;

      const rootId = chat.parentChatId ?? chat.id;

      const prefix = chat.messages.slice(0, msgIndex).map(m => ({
        ...m,
        id: generateRandomId(),
      }));

      const editedMsg: ChatMessage = {
        id: generateRandomId(),
        content: newContent,
        role: 'user',
      };

      const now = Date.now();
      const branch: Chat = {
        id: generateRandomId(),
        title: chat.title,
        messages: [...prefix, editedMsg],
        timestamp: now,
        createdAt: now,
        modelPath: chat.modelPath,
        parentChatId: rootId,
        branchFromMsgId: messageId,
        branchPointIndex: msgIndex,
      };

      this.cache.unshift(branch);
      this.currentChatId = branch.id;
      await this.persistCurrentChat();
      await this.saveChat(branch);
      this.notifyListeners();
      return branch;
    } catch (error) {
      return null;
    }
  }

  getAllBranchInfo(
    chatId: string,
  ): Map<number, { total: number; current: number; branches: string[] }> {
    const result = new Map<
      number,
      { total: number; current: number; branches: string[] }
    >();
    const chat = this.getChatById(chatId);
    if (!chat) return result;

    if (
      chat.parentChatId !== undefined &&
      chat.branchPointIndex !== undefined &&
      chat.branchFromMsgId
    ) {
      const parent = this.getChatById(chat.parentChatId);
      if (parent) {
        const siblings = [parent.id];
        const branches = this.cache
          .filter(
            c =>
              c.parentChatId === parent.id &&
              c.branchPointIndex === chat.branchPointIndex,
          )
          .sort((a, b) => a.createdAt - b.createdAt);
        for (const b of branches) {
          siblings.push(b.id);
        }
        if (siblings.length > 1) {
          const currentIdx = siblings.indexOf(chatId);
          result.set(chat.branchPointIndex, {
            total: siblings.length,
            current: currentIdx,
            branches: siblings,
          });
        }
      }
    }

    const childBranches = this.cache.filter(c => c.parentChatId === chatId);
    const branchPoints = new Map<number, Chat[]>();
    for (const child of childBranches) {
      if (child.branchPointIndex === undefined) continue;
      const key = child.branchPointIndex;
      if (!branchPoints.has(key)) {
        branchPoints.set(key, []);
      }
      branchPoints.get(key)!.push(child);
    }

    for (const [pointIdx, branches] of branchPoints) {
      if (result.has(pointIdx)) continue;

      const siblings = [chatId];
      branches.sort((a, b) => a.createdAt - b.createdAt);
      for (const b of branches) {
        siblings.push(b.id);
      }
      if (siblings.length > 1) {
        result.set(pointIdx, {
          total: siblings.length,
          current: 0,
          branches: siblings,
        });
      }
    }

    return result;
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
      const modelName = typeof entry.modelName === 'string' && entry.modelName.trim().length > 0
        ? entry.modelName.trim()
        : undefined;
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
        modelName,
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
      modelName?: string | null;
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

      if (updates.modelName !== undefined) {
        message.modelName = updates.modelName === null ? undefined : updates.modelName;
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
    const chatId = this.currentChatId;
    if (!chatId) return;

    const chat = this.getChatById(chatId);
    if (!chat) return;

    const tryTitle = async (attempt: number) => {
      try {
        if (this.currentProvider === 'local') {
          const { llamaManager } = await import('./LlamaManager');
          if (llamaManager.isGenBusy()) {
            console.log('title_defer_busy', attempt);
            if (attempt < 3) {
              setTimeout(() => {
                void tryTitle(attempt + 1);
              }, 4000);
            }
            return;
          }
        }

        const title = await this.generateChatTitle(userMessage);
        const chatToUpdate = this.getChatById(chatId);
        if (chatToUpdate && chatToUpdate.messages.filter(m => m.role === 'user').length === 1) {
          chatToUpdate.title = title;
          await this.saveChat(chatToUpdate);
          this.notifyListeners();
          console.log('title_saved', title);
        }
      } catch (error) {
        console.log('title_gen_failed', error instanceof Error ? error.message : 'unknown');
        if (this.currentProvider === 'local' && attempt < 3) {
          setTimeout(() => {
            void tryTitle(attempt + 1);
          }, 4000);
        }
      }
    };

    const delayMs = this.currentProvider === 'local' ? 8000 : 1000;
    console.log('title_schedule', delayMs);
    setTimeout(() => {
      void tryTitle(0);
    }, delayMs);
  }

  async generateChatTitle(userMessage: string): Promise<string> {
    try {
      if (this.currentProvider === 'local') {
        const { engineService } = await import('../services/runtime-service');
        if (engineService.mgr().ready()) {
          const { llamaManager } = await import('./LlamaManager');
          return await llamaManager.generateChatTitle(userMessage);
        }
      } else if (
        this.currentProvider === 'gemini' ||
        this.currentProvider === 'chatgpt' ||
        this.currentProvider === 'claude'
      ) {
        const { onlineModelService } = await import('../services/OnlineModelService');
        const hasApiKey = await onlineModelService.hasApiKey(this.currentProvider);
        if (hasApiKey) {
          return await onlineModelService.generateChatTitle(userMessage, this.currentProvider);
        }
      }

      const { engineService } = await import('../services/runtime-service');
      if (engineService.mgr().ready()) {
        const { llamaManager } = await import('./LlamaManager');
        return await llamaManager.generateChatTitle(userMessage);
      }

      const { onlineModelService } = await import('../services/OnlineModelService');
      const providers: ('gemini' | 'chatgpt' | 'claude')[] = ['gemini', 'chatgpt', 'claude'];
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
