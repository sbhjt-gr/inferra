import { chatDatabase, Chat, ChatMessage } from './ChatDatabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CURRENT_CHAT_ID_KEY = 'current_chat_id';

class ChatService {
  private currentChatId: string | null = null;
  private listeners: Set<() => void> = new Set();
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      console.log('chat_service_init');
      const currentId = await AsyncStorage.getItem(CURRENT_CHAT_ID_KEY);
      this.currentChatId = currentId;
      console.log('current_chat_loaded', currentId);
      this.isInitialized = true;
      this.notifyListeners();
    } catch (error) {
      console.log('chat_service_init_error', error);
      this.isInitialized = true;
    }
  }

  addListener(listener: () => void) {
    this.listeners.add(listener);
    
    const databaseUnsubscribe = chatDatabase.addListener(() => {
      this.notifyListeners();
    });

    return () => {
      this.listeners.delete(listener);
      databaseUnsubscribe();
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }

  private async saveCurrentChatId() {
    if (this.currentChatId) {
      await AsyncStorage.setItem(CURRENT_CHAT_ID_KEY, this.currentChatId);
    } else {
      await AsyncStorage.removeItem(CURRENT_CHAT_ID_KEY);
    }
  }

  async createNewChat(): Promise<Chat> {
    console.log('create_new_chat');
    
    const chat = await chatDatabase.createChat();
    this.currentChatId = chat.id;
    console.log('new_chat_created', chat.id);
    await this.saveCurrentChatId();
    this.notifyListeners();
    return chat;
  }

  async getCurrentChat(): Promise<Chat | null> {
    if (!this.currentChatId) {
      return null;
    }
    console.log('get_current_chat', this.currentChatId);
    return await chatDatabase.getChatById(this.currentChatId);
  }

  getCurrentChatId(): string | null {
    return this.currentChatId;
  }

  async clearCurrentChat(): Promise<void> {
    console.log('clear_current_chat');
    this.currentChatId = null;
    await this.saveCurrentChatId();
  }

  async setCurrentChat(chatId: string): Promise<boolean> {
    console.log('set_current_chat', chatId);
    const chat = await chatDatabase.getChatById(chatId);
    if (!chat) {
      console.log('chat_not_found', chatId);
      return false;
    }

    this.currentChatId = chatId;
    await this.saveCurrentChatId();
    console.log('current_chat_set', chatId);
    this.notifyListeners();
    return true;
  }

  async getAllChats(): Promise<Chat[]> {
    return await chatDatabase.getAllChats();
  }

  async addMessage(message: Omit<ChatMessage, 'id'>): Promise<string | null> {
    if (!this.currentChatId) {
      console.log('add_message_no_chat_creating');
      const newChat = await this.createNewChat();
      console.log('chat_created_for_message', newChat.id);
    }

    console.log('add_message', this.currentChatId, message.role);
    const messageId = await chatDatabase.addMessage(this.currentChatId!, message);
    
    if (message.role === 'user') {
      const chat = await this.getCurrentChat();
      if (chat && chat.messages) {
        const userMessages = chat.messages.filter(m => m.role === 'user');
        if (userMessages.length === 1) {
          console.log('generate_title_trigger');
          this.generateTitleForCurrentChat(message.content);
        }
      }
    }

    this.notifyListeners();
    return messageId;
  }

  async editMessage(messageId: string, content: string): Promise<boolean> {
    const success = await chatDatabase.updateMessage(messageId, content);
    if (success) {
      this.notifyListeners();
    }
    return success;
  }

  async updateMessageContent(messageId: string, content: string, thinking?: string, stats?: any): Promise<boolean> {
    const success = await chatDatabase.updateMessageContent(messageId, content, thinking, stats);
    if (success) {
      this.notifyListeners();
    }
    return success;
  }

  async deleteChat(chatId: string): Promise<boolean> {
    console.log('delete_chat', chatId);
    const success = await chatDatabase.deleteChat(chatId);
    
    if (success && this.currentChatId === chatId) {
      console.log('deleted_current_chat');
      this.currentChatId = null;
      await this.saveCurrentChatId();
    }
    
    if (success) {
      this.notifyListeners();
    }
    return success;
  }

  async deleteAllChats(): Promise<boolean> {
    console.log('delete_all_chats_service');
    const success = await chatDatabase.deleteAllChats();
    console.log('delete_all_chats_db_result', success);
    
    if (success) {
      console.log('clearing_current_chat');
      this.currentChatId = null;
      await this.saveCurrentChatId();
      this.notifyListeners();
    }
    
    return success;
  }

  async cleanupOldEmptyChats(): Promise<void> {
    await chatDatabase.cleanupEmptyChats();
  }

  async updateChatTitle(chatId: string, title: string): Promise<boolean> {
    return await chatDatabase.updateChatTitle(chatId, title);
  }

  private async generateTitleForCurrentChat(userMessage: string): Promise<void> {
    if (!this.currentChatId) return;

    try {
      setTimeout(async () => {
        try {
          let title = userMessage
            .replace(/^\s*["']|["']\s*$/g, '')
            .substring(0, 50);
          
          if (userMessage.length > 50) {
            title += '...';
          }
          
          if (title.trim()) {
            await this.updateChatTitle(this.currentChatId!, title);
          }
        } catch (error) {
          // Ignore errors in title generation
        }
      }, 1000);
    } catch (error) {
      // Ignore errors
    }
  }

  async updateChatMessages(chatId: string, messages: ChatMessage[]): Promise<boolean> {
    try {
      const existingMessages = await chatDatabase.getChatMessages(chatId);
      
      for (const message of messages) {
        const existing = existingMessages.find(m => m.id === message.id);
        if (existing) {
          if (existing.content !== message.content || 
              existing.thinking !== message.thinking ||
              JSON.stringify(existing.stats) !== JSON.stringify(message.stats)) {
            await chatDatabase.updateMessageContent(
              message.id,
              message.content,
              message.thinking,
              message.stats
            );
          }
        } else {
          await chatDatabase.addMessage(chatId, {
            content: message.content,
            role: message.role,
            thinking: message.thinking,
            stats: message.stats
          });
        }
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

export const chatService = new ChatService();
export { Chat, ChatMessage } from './ChatDatabase';
