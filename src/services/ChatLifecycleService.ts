import AsyncStorage from '@react-native-async-storage/async-storage';
import chatManager from '../utils/ChatManager';
import { llamaManager } from '../utils/LlamaManager';
import { modelSettingsService } from '../services/ModelSettingsService';
import { usageTrackingService } from '../services/UsageTrackingService';
import { inAppReviewService } from '../services/InAppReviewService';

export interface ChatLifecycleCallbacks {
  setChat: (chat: any) => void;
  setMessages: (messages: any[]) => void;
}

export class ChatLifecycleService {
  
  static async getEffectiveSettings(activeProvider: string | null) {
    const rawModelPath = activeProvider === 'local' ? llamaManager.getModelPath() : null;
    const currentModelPath = rawModelPath && !rawModelPath.startsWith('file://') 
      ? `file://${rawModelPath}` 
      : rawModelPath;
    
    if (currentModelPath && activeProvider === 'local') {
      const settings = await modelSettingsService.getModelSettings(currentModelPath);
      return {
        ...llamaManager.getSettings(),
        ...settings
      };
    }
    
    return llamaManager.getSettings();
  }

  static async initializeSessionAndReview() {
    await usageTrackingService.startSession();
    
    setTimeout(async () => {
      try {
        await inAppReviewService.checkAndRequestReview();
      } catch (error) {
      }
    }, 2000);
  }

  static async loadCurrentChat(callbacks: ChatLifecycleCallbacks) {
    try {
      await chatManager.ensureInitialized();
      const currentChat = chatManager.getCurrentChat();
      if (currentChat) {
        callbacks.setChat(currentChat);
        callbacks.setMessages(currentChat.messages);
      } else {
        const newChat = await chatManager.createNewChat();
        callbacks.setChat(newChat);
        callbacks.setMessages(newChat.messages);
      }
    } catch (error) {
    }
  }

  static async startNewChat(callbacks: ChatLifecycleCallbacks) {
    try {
      await chatManager.ensureInitialized();
      const newChat = await chatManager.createNewChat();
      callbacks.setChat(newChat);
      callbacks.setMessages(newChat.messages);
      return newChat;
    } catch (error) {
      throw error;
    }
  }

  static async loadChatById(
    chatId: string, 
    loadChat: (chatId: string) => Promise<void>,
    callbacks: ChatLifecycleCallbacks
  ) {
    try {
      await loadChat(chatId);
    } catch (error) {
      throw error;
    }
  }

  static setupAppStateListener(
    loadCurrentChat: () => Promise<void>,
    isRegenerating: boolean,
    isStreaming: boolean,
    isLoading: boolean
  ) {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        if (!isRegenerating && !isStreaming && !isLoading) {
          loadCurrentChat();
        }
      }
    };

    return handleAppStateChange;
  }

  static async recheckApiKeys(
    activeProvider: string | null,
    enableRemoteModels: boolean,
    isLoggedIn: boolean,
    onlineModelService: any,
    setActiveProvider: (provider: string | null) => void
  ) {
    if (activeProvider && activeProvider !== 'local') {
      if (!enableRemoteModels || !isLoggedIn) {
        setActiveProvider(null);
        return;
      }
      
      const hasKey = await onlineModelService.hasApiKey(activeProvider);
      if (!hasKey) {
        setActiveProvider(null);
      }
    }
  }
}
