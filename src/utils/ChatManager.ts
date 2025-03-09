import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values'; // Keep this import for other crypto needs
import { v4 as uuidv4 } from 'uuid';

// Add a fallback random ID generator in case uuid still fails
const generateRandomId = () => {
  try {
    return uuidv4(); // Try to use uuid first
  } catch (error) {
    // Fallback to a simple implementation if uuid fails
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${randomStr}`;
  }
};

export type ChatMessage = {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  thinking?: string;
  stats?: {
    duration: number;
    tokens: number;
  };
};

export type Chat = {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: number;
  modelPath?: string;
};

// Key constants
const CHATS_STORAGE_KEY = 'chat_list';
const CURRENT_CHAT_ID_KEY = 'current_chat_id';

class ChatManager {
  private chats: Chat[] = [];
  private currentChatId: string | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadAllChats();
  }

  // Add a listener for changes
  addListener(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notify all listeners of changes
  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }

  // Load all saved chats from storage
  async loadAllChats() {
    try {
      const chatsJson = await AsyncStorage.getItem(CHATS_STORAGE_KEY);
      if (chatsJson) {
        this.chats = JSON.parse(chatsJson);
      } else {
        this.chats = [];
      }

      // Load the current chat ID from storage
      const currentId = await AsyncStorage.getItem(CURRENT_CHAT_ID_KEY);
      this.currentChatId = currentId;
      
      // If no current chat or it doesn't exist, don't create one automatically
      // Let the UI handle this decision
      
      this.notifyListeners();
    } catch (error) {
      console.error('Error loading chats:', error);
      this.chats = [];
    }
  }

  // Save all chats to storage
  private async saveAllChats() {
    try {
      // Filter out empty chats (chats with no messages or only system messages)
      const nonEmptyChats = this.chats.filter(chat => {
        // Check if the chat has any user or assistant messages
        return chat.messages.some(msg => msg.role === 'user' || msg.role === 'assistant');
      });
      
      // Save only non-empty chats
      await AsyncStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(nonEmptyChats));
      
      // Update the in-memory chats list to match what was saved
      this.chats = nonEmptyChats;
      
      // If current chat was filtered out (because it was empty), reset currentChatId
      if (this.currentChatId && !this.getChatById(this.currentChatId)) {
        this.currentChatId = null;
      }
      
      this.notifyListeners();
      return true;
    } catch (error) {
      console.error('Error saving chats:', error);
      return false;
    }
  }

  // Save current chat ID
  private async saveCurrentChatId() {
    if (this.currentChatId) {
      await AsyncStorage.setItem(CURRENT_CHAT_ID_KEY, this.currentChatId);
    }
  }

  // Get all chats
  getAllChats(): Chat[] {
    return [...this.chats].sort((a, b) => b.timestamp - a.timestamp);
  }

  // Get current chat
  getCurrentChat(): Chat | null {
    if (!this.currentChatId) return null;
    return this.getChatById(this.currentChatId);
  }

  // Get chat by ID
  getChatById(id: string): Chat | null {
    return this.chats.find(chat => chat.id === id) || null;
  }

  // Create a new chat
  async createNewChat(initialMessages: ChatMessage[] = []): Promise<Chat> {
    // Save current chat if it exists and has messages
    if (this.currentChatId) {
      const currentChat = this.getChatById(this.currentChatId);
      if (currentChat && currentChat.messages.some(msg => msg.role === 'user' || msg.role === 'assistant')) {
        currentChat.timestamp = Date.now();
        await this.saveAllChats();
      }
    }

    // Check if there's already an empty chat we can reuse
    const existingEmptyChat = this.chats.find(chat => 
      !chat.messages.some(msg => msg.role === 'user' || msg.role === 'assistant')
    );

    if (existingEmptyChat) {
      // Reuse the existing empty chat
      this.currentChatId = existingEmptyChat.id;
      existingEmptyChat.timestamp = Date.now();
      existingEmptyChat.messages = initialMessages;
      
      await this.saveCurrentChatId();
      this.notifyListeners();
      
      return existingEmptyChat;
    }

    // Create a new chat if no empty chat exists
    const newChat: Chat = {
      id: generateRandomId(),
      title: 'New Chat', // Default title
      messages: initialMessages,
      timestamp: Date.now(),
    };

    this.chats.unshift(newChat);
    this.currentChatId = newChat.id;

    await this.saveCurrentChatId();
    this.notifyListeners();
    
    return newChat;
  }

  // Set current chat by ID
  async setCurrentChat(chatId: string): Promise<boolean> {
    // Save previous chat
    await this.saveCurrentChat();
    
    const chat = this.getChatById(chatId);
    if (!chat) return false;

    this.currentChatId = chatId;
    await this.saveCurrentChatId();
    
    // Make sure to save all chats to ensure the current chat ID is persisted
    await this.saveAllChats();
    
    this.notifyListeners();
    
    return true;
  }

  // Save current chat (internal helper)
  private async saveCurrentChat() {
    if (!this.currentChatId) return;
    
    const currentChat = this.getChatById(this.currentChatId);
    if (currentChat) {
      currentChat.timestamp = Date.now();
      await this.saveAllChats();
    }
  }

  // Add message to current chat
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
    
    // Update title if this is the first user message
    if (message.role === 'user' && 
        currentChat.messages.filter(m => m.role === 'user').length === 1) {
      currentChat.title = message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '');
    }

    await this.saveAllChats();
    this.notifyListeners();
    
    return true;
  }

  // Delete a chat
  async deleteChat(chatId: string): Promise<boolean> {
    const index = this.chats.findIndex(chat => chat.id === chatId);
    if (index === -1) return false;

    this.chats.splice(index, 1);
    
    // If we deleted the current chat, create a new one or set to the first available
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

  // Delete all chats
  async deleteAllChats(): Promise<boolean> {
    this.chats = [];
    const newChat = await this.createNewChat();
    this.currentChatId = newChat.id;
    
    await this.saveAllChats();
    await this.saveCurrentChatId();
    this.notifyListeners();
    
    return true;
  }

  // Get current chat ID
  getCurrentChatId(): string | null {
    return this.currentChatId;
  }

  // Update chat with new messages
  async updateChatMessages(chatId: string, messages: ChatMessage[]): Promise<boolean> {
    const chat = this.getChatById(chatId);
    if (!chat) return false;

    chat.messages = messages;
    chat.timestamp = Date.now();
    
    await this.saveAllChats();
    this.notifyListeners();
    
    return true;
  }

  // Update current chat's messages
  async updateCurrentChatMessages(messages: ChatMessage[]): Promise<boolean> {
    if (!this.currentChatId) return false;
    return this.updateChatMessages(this.currentChatId, messages);
  }

  // Update message content (for streaming)
  async updateMessageContent(messageId: string, content: string, thinking?: string, stats?: { duration: number; tokens: number }): Promise<boolean> {
    if (!this.currentChatId) return false;
    
    const currentChat = this.getChatById(this.currentChatId);
    if (!currentChat) return false;

    const message = currentChat.messages.find(m => m.id === messageId);
    if (!message) return false;

    message.content = content;
    if (thinking !== undefined) message.thinking = thinking;
    if (stats) message.stats = stats;

    // Save to AsyncStorage in real-time
    this.debouncedSaveAllChats();
    
    // Notify listeners for UI update
    this.notifyListeners();
    return true;
  }

  // Debounced save to avoid too many AsyncStorage writes
  private saveDebounceTimeout: NodeJS.Timeout | null = null;
  private async debouncedSaveAllChats() {
    if (this.saveDebounceTimeout) {
      clearTimeout(this.saveDebounceTimeout);
    }
    
    this.saveDebounceTimeout = setTimeout(async () => {
      await this.saveAllChats();
      this.saveDebounceTimeout = null;
    }, 500); // Debounce for 500ms
  }
}

// Create a singleton instance
export const chatManager = new ChatManager();
export default chatManager; 