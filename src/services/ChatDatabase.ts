import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const generateRandomId = () => {
  try {
    return uuidv4();
  } catch (error) {
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
    firstTokenTime?: number;
    avgTokenTime?: number;
  };
};

export type Chat = {
  id: string;
  title: string;
  timestamp: number;
  messages?: ChatMessage[];
};

class ChatDatabase {
  private db: SQLite.SQLiteDatabase;
  private listeners: Set<() => void> = new Set();

  constructor() {
    console.log('chat_db_init');
    this.db = SQLite.openDatabaseSync('chats.db');
    this.initializeDatabase();
  }

  private initializeDatabase() {
    console.log('db_schema_init');
    this.db.execSync(`
      PRAGMA journal_mode = WAL;
      
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        content TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        thinking TEXT,
        stats TEXT,
        timestamp INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
      CREATE INDEX IF NOT EXISTS idx_chats_timestamp ON chats(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    `);
    console.log('db_schema_ready');
  }

  addListener(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }

  async createChat(title: string = 'New Chat'): Promise<Chat> {
    const chatId = generateRandomId();
    const timestamp = Date.now();
    
    console.log('db_create_chat', chatId);
    
    try {
      this.db.runSync(
        'INSERT INTO chats (id, title, timestamp) VALUES (?, ?, ?)',
        [chatId, title, timestamp]
      );

      const insertedChat = this.db.getFirstSync(
        'SELECT id, title, timestamp FROM chats WHERE id = ?',
        [chatId]
      ) as Chat | null;

      if (!insertedChat) {
        console.log('chat_insert_failed', chatId);
        throw new Error('Chat insert failed');
      }

      const chat: Chat = {
        id: insertedChat.id,
        title: insertedChat.title,
        timestamp: insertedChat.timestamp,
        messages: []
      };

      console.log('chat_insert_success', chatId);
      this.notifyListeners();
      return chat;
    } catch (error) {
      console.log('db_create_error', error);
      throw error;
    }
  }

  async getAllChats(): Promise<Chat[]> {
    const chats = this.db.getAllSync(
      'SELECT id, title, timestamp FROM chats ORDER BY timestamp DESC'
    ) as Chat[];

    const chatsWithMessageCounts = chats.map(chat => {
      const messageCount = this.db.getFirstSync(
        'SELECT COUNT(*) as count FROM messages WHERE chat_id = ?',
        [chat.id]
      ) as { count: number };
      
      return {
        ...chat,
        messageCount: messageCount.count
      };
    });

    return chatsWithMessageCounts;
  }

  async getChatById(chatId: string): Promise<Chat | null> {
    const chat = this.db.getFirstSync(
      'SELECT id, title, timestamp FROM chats WHERE id = ?',
      [chatId]
    ) as Chat | null;

    if (!chat) {
      console.log('chat_not_found_db', chatId);
      const allChats = this.db.getAllSync('SELECT id FROM chats LIMIT 5') as { id: string }[];
      console.log('recent_chats', allChats.map(c => c.id));
      return null;
    }

    const messages = this.db.getAllSync(
      'SELECT id, content, role, thinking, stats, timestamp FROM messages WHERE chat_id = ? ORDER BY timestamp ASC',
      [chatId]
    ) as any[];

    console.log('messages_from_db', chatId, messages.length);

    chat.messages = messages.map(msg => ({
      ...msg,
      stats: msg.stats ? JSON.parse(msg.stats) : undefined,
    }));

    console.log('chat_with_messages', chat.id, chat.messages.length);
    return chat;
  }

  async addMessage(chatId: string, message: Omit<ChatMessage, 'id'>): Promise<string> {
    const messageId = generateRandomId();
    const timestamp = Date.now();
    
    console.log('db_add_message', chatId, messageId, message.role);
    this.db.runSync(
      'INSERT INTO messages (id, chat_id, content, role, thinking, stats, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        messageId,
        chatId,
        message.content,
        message.role,
        message.thinking || null,
        message.stats ? JSON.stringify(message.stats) : null,
        timestamp
      ]
    );

    this.db.runSync(
      'UPDATE chats SET timestamp = ? WHERE id = ?',
      [timestamp, chatId]
    );

    this.notifyListeners();
    return messageId;
  }  async updateMessage(messageId: string, content: string): Promise<boolean> {
    try {
      const result = this.db.runSync(
        'UPDATE messages SET content = ? WHERE id = ?',
        [content, messageId]
      );

      if (result.changes > 0) {
        this.notifyListeners();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async updateMessageContent(messageId: string, content: string, thinking?: string, stats?: any): Promise<boolean> {
    try {
      const result = this.db.runSync(
        'UPDATE messages SET content = ?, thinking = ?, stats = ? WHERE id = ?',
        [
          content,
          thinking || null,
          stats ? JSON.stringify(stats) : null,
          messageId
        ]
      );

      if (result.changes > 0) {
        this.notifyListeners();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async deleteChat(chatId: string): Promise<boolean> {
    try {
      console.log('db_delete_chat', chatId);
      this.db.runSync('DELETE FROM chats WHERE id = ?', [chatId]);
      this.notifyListeners();
      return true;
    } catch (error) {
      console.log('db_delete_error', error);
      return false;
    }
  }

  async deleteAllChats(): Promise<boolean> {
    try {
      console.log('db_delete_all_chats');
      this.db.runSync('DELETE FROM messages');
      this.db.runSync('DELETE FROM chats');
      console.log('db_delete_all_success');
      this.notifyListeners();
      return true;
    } catch (error) {
      console.log('db_delete_all_error', error);
      return false;
    }
  }

  async updateChatTitle(chatId: string, title: string): Promise<boolean> {
    try {
      const result = this.db.runSync(
        'UPDATE chats SET title = ? WHERE id = ?',
        [title, chatId]
      );

      if (result.changes > 0) {
        this.notifyListeners();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async getChatMessages(chatId: string): Promise<ChatMessage[]> {
    const messages = this.db.getAllSync(
      'SELECT id, content, role, thinking, stats, timestamp FROM messages WHERE chat_id = ? ORDER BY timestamp ASC',
      [chatId]
    ) as any[];

    return messages.map(msg => ({
      ...msg,
      stats: msg.stats ? JSON.parse(msg.stats) : undefined,
    }));
  }

  async getMessageCount(chatId: string): Promise<number> {
    const result = this.db.getFirstSync(
      'SELECT COUNT(*) as count FROM messages WHERE chat_id = ?',
      [chatId]
    ) as { count: number };

    return result.count;
  }

  async cleanupEmptyChats(): Promise<void> {
    try {
      console.log('cleanup_empty_chats');
      this.db.runSync(`
        DELETE FROM chats 
        WHERE id NOT IN (
          SELECT DISTINCT chat_id 
          FROM messages 
          WHERE role IN ('user', 'assistant')
        )
        AND created_at < (strftime('%s', 'now') - 300)
      `);
      this.notifyListeners();
    } catch (error) {
      console.log('cleanup_error', error);
    }
  }

  close() {
    this.db.closeSync();
  }
}

export const chatDatabase = new ChatDatabase();
