import { useState, useCallback, useRef } from 'react';
import { ChatMessage } from '../utils/ChatManager';
import chatManager from '../utils/ChatManager';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useChatManagement = () => {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isUpdatingChat, setIsUpdatingChat] = useState(false);
  const [chats, setChats] = useState<string[]>([]);
  const [chatTitles, setChatTitles] = useState<{ [key: string]: string }>({});
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadChats = useCallback(async () => {
    try {
      const chatList = chatManager.getAllChats();
      setChats(chatList.map(chat => chat.id));
      
      const titles: { [key: string]: string } = {};
      for (const chat of chatList) {
        titles[chat.id] = chat.title;
      }
      setChatTitles(titles);
    } catch (error) {
      console.error('error_loading_chats', error);
    }
  }, []);

  const loadChat = useCallback(async (id: string) => {
    setIsLoadingChat(true);
    try {
      const chat = chatManager.getChatById(id);
      if (chat) {
        setMessages(chat.messages || []);
        setChatId(id);
      }
    } catch (error) {
      console.error('error_loading_chat', error);
    } finally {
      setIsLoadingChat(false);
    }
  }, []);

  const createNewChat = useCallback(async () => {
    const newChat = await chatManager.createNewChat();
    setChatId(newChat.id);
    setMessages([]);
    setInputText('');
    
    loadChats();
    
    return newChat.id;
  }, [loadChats]);

  const saveMessages = useCallback((messagesToSave: ChatMessage[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (chatId) {
        try {
          await chatManager.updateChatMessages(chatId, messagesToSave);
        } catch (error) {
          console.error('error_saving_messages', error);
        }
      }
    }, 500);
  }, [chatId]);

  const saveMessagesImmediate = useCallback(async (messagesToSave: ChatMessage[]) => {
    if (chatId) {
      try {
        await chatManager.updateChatMessages(chatId, messagesToSave);
      } catch (error) {
        console.error('error_saving_messages_immediate', error);
        throw error;
      }
    }
  }, [chatId]);

  const saveMessagesDebounced = {
    cancel: () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    }
  };

  const updateChatTitle = useCallback(async (id: string, newTitle: string) => {
    setIsUpdatingChat(true);
    try {
      const chat = chatManager.getChatById(id);
      if (chat) {
        chat.title = newTitle;
        await chatManager.updateChatMessages(id, chat.messages);
        setChatTitles(prev => ({ ...prev, [id]: newTitle }));
      }
    } catch (error) {
      console.error('error_updating_chat_title', error);
    } finally {
      setIsUpdatingChat(false);
    }
  }, []);

  const deleteChat = useCallback(async (id: string) => {
    try {
      await chatManager.deleteChat(id);
      
      setChats(prev => prev.filter(chatId => chatId !== id));
      setChatTitles(prev => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      
      if (chatId === id) {
        const newChatId = await createNewChat();
        setChatId(newChatId);
      }
    } catch (error) {
      console.error('error_deleting_chat', error);
    }
  }, [chatId, createNewChat]);

  return {
    chatId,
    setChatId,
    messages,
    setMessages,
    inputText,
    setInputText,
    isLoadingChat,
    isUpdatingChat,
    chats,
    chatTitles,
    loadChats,
    loadChat,
    createNewChat,
    saveMessages,
    saveMessagesImmediate,
    saveMessagesDebounced,
    updateChatTitle,
    deleteChat,
  };
};
