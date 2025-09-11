import AsyncStorage from '@react-native-async-storage/async-storage';

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


const CHATS_STORAGE_KEY = 'chat_list';
const CURRENT_CHAT_ID_KEY = 'current_chat_id';

class ChatManager {
  private chats: Chat[] = [];
  private currentChatId: string | null = null;
  private listeners: Set<() => void> = new Set();
  private currentProvider: 'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude' | null = null;

  constructor() {
    this.loadAllChats();
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
      const chatsJson = await AsyncStorage.getItem(CHATS_STORAGE_KEY);
      if (chatsJson) {
        this.chats = JSON.parse(chatsJson);
      } else {
        this.chats = [];
      }

      
      const currentId = await AsyncStorage.getItem(CURRENT_CHAT_ID_KEY);
      this.currentChatId = currentId;
      
      
      
      
      this.notifyListeners();
    } catch (error) {
      this.chats = [];
    }
  }

  private async saveAllChats() {
    try {
      const nonEmptyChats = this.chats.filter(chat => {
        return chat.messages.some(msg => msg.role === 'user' || msg.role === 'assistant');
      });
      
      await AsyncStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(nonEmptyChats));
      
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
    if (this.currentChatId) {
      await AsyncStorage.setItem(CURRENT_CHAT_ID_KEY, this.currentChatId);
    }
  }

  
  getAllChats(): Chat[] {
    return [...this.chats].sort((a, b) => b.timestamp - a.timestamp);
  }

  
  getCurrentChat(): Chat | null {
    if (!this.currentChatId) return null;
    return this.getChatById(this.currentChatId);
  }

  
  getChatById(id: string): Chat | null {
    return this.chats.find(chat => chat.id === id) || null;
  }

  
  async createNewChat(initialMessages: ChatMessage[] = []): Promise<Chat> {
    
    if (this.currentChatId) {
      const currentChat = this.getChatById(this.currentChatId);
      if (currentChat && currentChat.messages.some(msg => msg.role === 'user' || msg.role === 'assistant')) {
        currentChat.timestamp = Date.now();
        await this.saveAllChats();
      }
    }

    
    const existingEmptyChat = this.chats.find(chat => 
      !chat.messages.some(msg => msg.role === 'user' || msg.role === 'assistant')
    );

    if (existingEmptyChat) {
      
      this.currentChatId = existingEmptyChat.id;
      existingEmptyChat.timestamp = Date.now();
      existingEmptyChat.messages = initialMessages;
      
      await this.saveCurrentChatId();
      this.notifyListeners();
      
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

    await this.saveCurrentChatId();
    this.notifyListeners();
    
    return newChat;
  }

  
  async setCurrentChat(chatId: string): Promise<boolean> {
    
    await this.saveCurrentChat();
    
    const chat = this.getChatById(chatId);
    if (!chat) return false;

    this.currentChatId = chatId;
    await this.saveCurrentChatId();
    
    
    await this.saveAllChats();
    
    this.notifyListeners();
    
    return true;
  }

  
  private async saveCurrentChat() {
    if (!this.currentChatId) return;
    
    const currentChat = this.getChatById(this.currentChatId);
    if (currentChat) {
      currentChat.timestamp = Date.now();
      await this.saveAllChats();
    }
  }

  
  async addMessage(message: Omit<ChatMessage, 'id'>): Promise<boolean> {
    if (!this.currentChatId) return false;
    
    const currentChat = this.getChatById(this.currentChatId);
    if (!currentChat) return false;

    const newMessage: ChatMessage = {
      ...message,
      id: generateRandomId(),
    };

    currentChat.messages.push(newMessage);
    currentChat.timestamp = Date.now();
    
    
    if (message.role === 'user' && 
        currentChat.messages.filter(m => m.role === 'user').length === 1) {
      
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
    if (!this.currentChatId) return;
    
    const currentChat = this.getChatById(this.currentChatId);
    if (!currentChat) return;

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
        } catch (error) {
        }
      }, 1000);
    } catch (error) {
      
    }
  }

  
  setCurrentProvider(provider: 'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude' | null) {
    this.currentProvider = provider;
  }

  getCurrentProvider(): 'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude' | null {
    return this.currentProvider;
  }

  
  private async generateChatTitle(userMessage: string): Promise<string> {
    try {
      
      if (this.currentProvider === 'local') {
        const { llamaManager } = await import('./LlamaManager');
        if (llamaManager.isInitialized()) {
          return await llamaManager.generateChatTitle(userMessage);
        }
      } else if (this.currentProvider === 'gemini' || this.currentProvider === 'chatgpt' || 
                 this.currentProvider === 'deepseek' || this.currentProvider === 'claude') {
        
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

  
  async deleteChat(chatId: string): Promise<boolean> {
    const index = this.chats.findIndex(chat => chat.id === chatId);
    if (index === -1) return false;

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
    this.chats = [];
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
    const chat = this.getChatById(chatId);
    if (!chat) return false;

    chat.messages = messages;
    chat.timestamp = Date.now();
    
    await this.saveAllChats();
    this.notifyListeners();
    
    return true;
  }

  
  async updateCurrentChatMessages(messages: ChatMessage[]): Promise<boolean> {
    if (!this.currentChatId) return false;
    return this.updateChatMessages(this.currentChatId, messages);
  }

  
  async updateMessageContent(messageId: string, content: string, thinking?: string, stats?: { duration: number; tokens: number; firstTokenTime?: number; avgTokenTime?: number }): Promise<boolean> {
    if (!this.currentChatId) return false;
    
    const currentChat = this.getChatById(this.currentChatId);
    if (!currentChat) return false;

    const message = currentChat.messages.find(m => m.id === messageId);
    if (!message) return false;

    message.content = content;
    if (thinking !== undefined) message.thinking = thinking;
    if (stats) message.stats = stats;

    
    this.debouncedSaveAllChats();
    
    
    this.notifyListeners();
    return true;
  }

  
  private saveDebounceTimeout: NodeJS.Timeout | null = null;
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
    if (!this.currentChatId) return false;
    
    const currentChat = this.getChatById(this.currentChatId);
    if (!currentChat) return false;

    const messageIndex = currentChat.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return false;

    const message = currentChat.messages[messageIndex];
    if (message.role !== 'user') return false;

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
