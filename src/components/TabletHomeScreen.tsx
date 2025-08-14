import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Platform,
  TouchableOpacity,
  Modal,
  Keyboard,
  AppState,
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  ToastAndroid,
  Clipboard,
  Dimensions,
  AppStateStatus,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ModelSelector, { ModelSelectorRef } from './ModelSelector';
import { llamaManager } from '../utils/LlamaManager';
import AppHeader from './AppHeader';
import { useFocusEffect, RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import * as Device from 'expo-device';
import chatManager, { Chat, ChatMessage } from '../utils/ChatManager';
import { getThemeAwareColor } from '../utils/ColorUtils';
import ChatView from './chat/ChatView';
import ChatInput from './chat/ChatInput';
import { onlineModelService } from '../services/OnlineModelService';
import { useModel } from '../context/ModelContext';
import { Dialog, Portal, PaperProvider, Button, Text as PaperText } from 'react-native-paper';
import { useDownloads } from '../context/DownloadContext';
import { modelDownloader } from '../services/ModelDownloader';
import { useRemoteModel } from '../context/RemoteModelContext';
import { useResponsive } from '../hooks/useResponsive';
import TabletSidebar from './TabletSidebar';

function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
  let timeout: NodeJS.Timeout | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };

  debounced.cancel = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

type TabletHomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  route: RouteProp<TabParamList, 'HomeTab'>;
};

const generateRandomId = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

export default function TabletHomeScreen({ route, navigation }: TabletHomeScreenProps) {
  const { theme: currentTheme, selectedTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const responsive = useResponsive();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const modelSelectorRef = useRef<ModelSelectorRef>(null);
  const [shouldOpenModelSelector, setShouldOpenModelSelector] = useState(false);
  const [preselectedModelPath, setPreselectedModelPath] = useState<string | null>(null);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const copyToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const copyToastMessageRef = useRef<string>('Copied to clipboard');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const cancelGenerationRef = useRef<boolean>(false);
  const [showMemoryWarning, setShowMemoryWarning] = useState(false);
  const [memoryWarningType, setMemoryWarningType] = useState('');
  const [onlineModelProvider, setOnlineModelProvider] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [streamingThinking, setStreamingThinking] = useState<string>('');
  const [streamingStats, setStreamingStats] = useState<{ tokens: number; duration: number; firstTokenTime?: number; avgTokenTime?: number } | null>(null);

  const { activeProvider } = useModel();
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogActions, setDialogActions] = useState<React.ReactElement[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const [justCancelled, setJustCancelled] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isCooldown, setIsCooldown] = useState(false);

  const showDialog = useCallback((title: string, message: string, actions: React.ReactElement[] = []) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogActions(actions);
    setDialogVisible(true);
  }, []);

  const hideDialog = useCallback(() => {
    setDialogVisible(false);
    setDialogTitle('');
    setDialogMessage('');
    setDialogActions([]);
  }, []);

  const startNewChat = useCallback(async () => {
    try {
      const newChat = await chatManager.createChat();
      setChat(newChat);
      setMessages([]);
      setStreamingMessage('');
      setIsStreaming(false);
      setStreamingMessageId(null);
      setIsRegenerating(false);
      setJustCancelled(false);
      cancelGenerationRef.current = false;
    } catch (error) {
      console.error('Error creating new chat:', error);
    }
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    Clipboard.setString(text);
    copyToastMessageRef.current = 'Copied to clipboard';
    setShowCopyToast(true);
    if (copyToastTimeoutRef.current) {
      clearTimeout(copyToastTimeoutRef.current);
    }
    copyToastTimeoutRef.current = setTimeout(() => {
      setShowCopyToast(false);
    }, 2000);
    
    if (Platform.OS === 'android') {
      ToastAndroid.show('Copied to clipboard', ToastAndroid.SHORT);
    }
  }, []);

  const processMessage = useCallback(async (userMessage: string, editingMessageId?: string) => {
    if (!chat) return;

    try {
      setIsLoading(true);
      setStreamingMessage('');
      setIsStreaming(false);
      setStreamingMessageId(null);
      setStreamingThinking('');
      setStreamingStats(null);
      setJustCancelled(false);
      cancelGenerationRef.current = false;

      let messagesToSend: ChatMessage[];
      
      if (editingMessageId) {
        messagesToSend = await chatManager.editMessageAndGetContext(chat.id, editingMessageId, userMessage);
        const updatedMessages = await chatManager.getMessages(chat.id);
        setMessages(updatedMessages);
      } else {
        const userMsg = await chatManager.addMessage(chat.id, 'user', userMessage);
        messagesToSend = await chatManager.getMessages(chat.id);
        setMessages(messagesToSend);
      }

      const assistantMessageId = generateRandomId();
      setStreamingMessageId(assistantMessageId);
      setIsStreaming(true);

      if (activeProvider === 'local') {
        await processLocalMessage(messagesToSend, assistantMessageId);
      } else {
        await processOnlineMessage(messagesToSend, assistantMessageId);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingMessage('');
      setStreamingMessageId(null);
    }
  }, [chat, activeProvider]);

  const processLocalMessage = async (messagesToSend: ChatMessage[], assistantMessageId: string) => {
    try {
      let fullResponse = '';
      const startTime = Date.now();
      let firstTokenTime: number | undefined;
      let tokenCount = 0;

      await llamaManager.generate(
        messagesToSend,
        (chunk, thinking) => {
          if (cancelGenerationRef.current) return;
          
          if (thinking !== undefined) {
            setStreamingThinking(thinking);
            return;
          }

          if (!firstTokenTime) {
            firstTokenTime = Date.now();
          }

          fullResponse += chunk;
          tokenCount++;
          setStreamingMessage(fullResponse);

          const currentTime = Date.now();
          const totalDuration = (currentTime - startTime) / 1000;
          const avgTokenTime = firstTokenTime ? (currentTime - firstTokenTime) / Math.max(tokenCount - 1, 1) : 0;

          setStreamingStats({
            tokens: tokenCount,
            duration: totalDuration,
            firstTokenTime: firstTokenTime ? (firstTokenTime - startTime) / 1000 : undefined,
            avgTokenTime
          });
        },
        (error) => {
          console.error('Generation error:', error);
          if (!cancelGenerationRef.current) {
            setIsLoading(false);
            setIsStreaming(false);
            setStreamingMessage('');
            setStreamingMessageId(null);
          }
        }
      );

      if (!cancelGenerationRef.current && fullResponse.trim()) {
        await chatManager.addMessage(chat!.id, 'assistant', fullResponse.trim());
        const updatedMessages = await chatManager.getMessages(chat!.id);
        setMessages(updatedMessages);
      }

      if (!cancelGenerationRef.current) {
        setIsLoading(false);
        setIsStreaming(false);
        setStreamingMessage('');
        setStreamingMessageId(null);
        setStreamingThinking('');
        setStreamingStats(null);
      }
    } catch (error) {
      console.error('Local generation error:', error);
      if (!cancelGenerationRef.current) {
        setIsLoading(false);
        setIsStreaming(false);
        setStreamingMessage('');
        setStreamingMessageId(null);
      }
    }
  };

  const processOnlineMessage = async (messagesToSend: ChatMessage[], assistantMessageId: string) => {
    try {
      let fullResponse = '';
      const startTime = Date.now();
      let firstTokenTime: number | undefined;
      let tokenCount = 0;

      await onlineModelService.generateResponse(
        messagesToSend,
        activeProvider!,
        (chunk, thinking) => {
          if (cancelGenerationRef.current) return;
          
          if (thinking !== undefined) {
            setStreamingThinking(thinking);
            return;
          }

          if (!firstTokenTime) {
            firstTokenTime = Date.now();
          }

          fullResponse += chunk;
          tokenCount++;
          setStreamingMessage(fullResponse);

          const currentTime = Date.now();
          const totalDuration = (currentTime - startTime) / 1000;
          const avgTokenTime = firstTokenTime ? (currentTime - firstTokenTime) / Math.max(tokenCount - 1, 1) : 0;

          setStreamingStats({
            tokens: tokenCount,
            duration: totalDuration,
            firstTokenTime: firstTokenTime ? (firstTokenTime - startTime) / 1000 : undefined,
            avgTokenTime
          });
        }
      );

      if (!cancelGenerationRef.current && fullResponse.trim()) {
        await chatManager.addMessage(chat!.id, 'assistant', fullResponse.trim());
        const updatedMessages = await chatManager.getMessages(chat!.id);
        setMessages(updatedMessages);
      }

      if (!cancelGenerationRef.current) {
        setIsLoading(false);
        setIsStreaming(false);
        setStreamingMessage('');
        setStreamingMessageId(null);
        setStreamingThinking('');
        setStreamingStats(null);
      }
    } catch (error) {
      console.error('Online generation error:', error);
      if (!cancelGenerationRef.current) {
        setIsLoading(false);
        setIsStreaming(false);
        setStreamingMessage('');
        setStreamingMessageId(null);
      }
    }
  };

  const handleSend = useCallback(async (message: string) => {
    await processMessage(message);
  }, [processMessage]);

  const handleCancelGeneration = useCallback(() => {
    cancelGenerationRef.current = true;
    setJustCancelled(true);
    
    if (activeProvider === 'local') {
      llamaManager.cancel();
    } else {
      onlineModelService.cancel();
    }
    
    setIsLoading(false);
    setIsStreaming(false);
    setStreamingMessage('');
    setStreamingMessageId(null);
    setStreamingThinking('');
    setStreamingStats(null);
    setIsRegenerating(false);
  }, [activeProvider]);

  const handleRegenerate = useCallback(async (messageId: string) => {
    if (!chat || isLoading || isRegenerating) return;

    try {
      setIsRegenerating(true);
      const messageIndex = messages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) return;

      const userMessage = messages[messageIndex - 1];
      if (!userMessage || userMessage.role !== 'user') return;

      await chatManager.deleteMessage(chat.id, messageId);
      const updatedMessages = await chatManager.getMessages(chat.id);
      setMessages(updatedMessages);

      await processMessage(userMessage.content);
    } catch (error) {
      console.error('Error regenerating response:', error);
    } finally {
      setIsRegenerating(false);
    }
  }, [chat, messages, isLoading, isRegenerating, processMessage]);

  const handleModelSelect = useCallback(async (modelPath: string) => {
    if (activeProvider === 'local' && llamaManager.getModelPath() !== modelPath) {
      try {
        setIsModelLoading(true);
        await llamaManager.loadModel(modelPath);
      } catch (error) {
        console.error('Error loading model:', error);
      } finally {
        setIsModelLoading(false);
      }
    }
  }, [activeProvider]);

  const renderModelSelectorComponent = () => {
    return (
      <ModelSelector
        ref={modelSelectorRef}
        visible={shouldOpenModelSelector}
        onClose={() => setShouldOpenModelSelector(false)}
        preselectedModelPath={preselectedModelPath}
        onModelSelect={handleModelSelect}
        isGenerating={isLoading || isRegenerating}
      />
    );
  };

  useFocusEffect(
    useCallback(() => {
      const initializeChat = async () => {
        try {
          const lastChatId = await AsyncStorage.getItem('lastChatId');
          if (lastChatId) {
            const lastChat = await chatManager.getChat(lastChatId);
            if (lastChat) {
              setChat(lastChat);
              const chatMessages = await chatManager.getMessages(lastChatId);
              setMessages(chatMessages);
              return;
            }
          }
          
          const newChat = await chatManager.createChat();
          setChat(newChat);
          setMessages([]);
          await AsyncStorage.setItem('lastChatId', newChat.id);
        } catch (error) {
          console.error('Error initializing chat:', error);
        }
      };

      initializeChat();
    }, [])
  );

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <TabletSidebar
        modelSelectorRef={modelSelectorRef}
        shouldOpenModelSelector={shouldOpenModelSelector}
        onCloseModelSelector={() => setShouldOpenModelSelector(false)}
        preselectedModelPath={activeProvider === 'local' ? llamaManager.getModelPath() : activeProvider}
        isGenerating={isLoading || isRegenerating}
        onModelSelect={handleModelSelect}
        onNewChat={startNewChat}
        onChatHistory={() => {}}
        onChatSelect={async (chatId: string) => {
          const chat = chatManager.getChatById(chatId);
          if (chat) {
            setMessages(chat.messages);
          }
        }}
        activeProvider={activeProvider}
      />

      <View style={styles.chatArea}>
        <AppHeader 
          onNewChat={startNewChat}
        />
        
        <KeyboardAvoidingView
          style={styles.chatContainer}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <ChatView
            messages={messages}
            isStreaming={isStreaming}
            streamingMessageId={streamingMessageId}
            streamingMessage={streamingMessage}
            streamingThinking={streamingThinking}
            streamingStats={streamingStats}
            onCopyText={copyToClipboard}
            onRegenerateResponse={handleRegenerate}
            isRegenerating={isRegenerating}
            justCancelled={justCancelled}
            flatListRef={flatListRef}
            onEditMessageAndRegenerate={processMessage}
          />

          <ChatInput
            onSend={handleSend}
            disabled={isLoading || isModelLoading || isCooldown}
            isLoading={isLoading}
            isRegenerating={isRegenerating}
            onCancel={handleCancelGeneration}
            style={{ backgroundColor: themeColors.background, borderTopColor: themeColors.borderColor }}
            placeholderColor={themeColors.secondaryText}
          />
        </KeyboardAvoidingView>
      </View>

      {showCopyToast && (
        <View style={styles.copyToast}>
          <Text style={styles.copyToastText}>{copyToastMessageRef.current}</Text>
        </View>
      )}

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={hideDialog}>
          <Dialog.Title>{dialogTitle}</Dialog.Title>
          <Dialog.Content>
            <PaperText>{dialogMessage}</PaperText>
          </Dialog.Content>
          <Dialog.Actions>
            {dialogActions.map((ActionComponent, index) =>
              React.isValidElement(ActionComponent) ? React.cloneElement(ActionComponent, { key: index }) : null
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  chatArea: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
  },
  copyToast: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 1000,
  },
  copyToastText: {
    color: '#fff',
    fontSize: 14,
  },
});
