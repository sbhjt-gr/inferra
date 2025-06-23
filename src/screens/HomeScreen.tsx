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
import ModelSelector, { ModelSelectorRef } from '../components/ModelSelector';
import { llamaManager } from '../utils/LlamaManager';
import AppHeader from '../components/AppHeader';
import { useFocusEffect, RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import * as Device from 'expo-device';
import chatManager, { Chat, ChatMessage } from '../utils/ChatManager';
import { getThemeAwareColor } from '../utils/ColorUtils';
import ChatView from '../components/chat/ChatView';
import ChatInput from '../components/chat/ChatInput';
import { onlineModelService } from '../services/OnlineModelService';
import { useModel } from '../context/ModelContext';
import { Dialog, Portal, PaperProvider, Button, Text as PaperText } from 'react-native-paper';
import { useDownloads } from '../context/DownloadContext';
import { modelDownloader } from '../services/ModelDownloader';
import { useRemoteModel } from '../context/RemoteModelContext';

const windowWidth = Dimensions.get('window').width;

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

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  route: RouteProp<TabParamList, 'HomeTab'>;
};

const generateRandomId = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

export default function HomeScreen({ route, navigation }: HomeScreenProps) {
  const { theme: currentTheme, selectedTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
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
  const [streamingStats, setStreamingStats] = useState<{ tokens: number; duration: number } | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const [appState, setAppState] = useState(appStateRef.current);
  const isFirstLaunchRef = useRef(true);
  const [activeProvider, setActiveProvider] = useState<'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude' | null>(null);
  const { loadModel, unloadModel, setSelectedModelPath, isModelLoading } = useModel();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogActions, setDialogActions] = useState<React.ReactNode[]>([]);

  const [isCooldown, setIsCooldown] = useState(false);

  const [justCancelled, setJustCancelled] = useState(false);

  const { enableRemoteModels, isLoggedIn } = useRemoteModel();

  const hideDialog = () => setDialogVisible(false);

  const showDialog = (title: string, message: string, actions: React.ReactNode[]) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogActions(actions);
    setDialogVisible(true);
  };

  const saveMessagesDebounced = useRef(debounce(async (messages: ChatMessage[]) => {
    if (chat) {
      await chatManager.updateChatMessages(chat.id, messages);
    }
  }, 500)).current;

  const updateMessageContentDebounced = useRef(debounce((
    messageId: string, 
    content: string, 
    thinking: string, 
    stats: { duration: number; tokens: number }
  ) => {
    chatManager.updateMessageContent(
      messageId,
      content,
      thinking,
      stats
    );
  }, 300)).current;

  useFocusEffect(
    useCallback(() => {
      modelSelectorRef.current?.refreshModels();
    }, [])
  );

  useEffect(() => {
    if (isFirstLaunchRef.current) {
      startNewChat();
      isFirstLaunchRef.current = false;
    } else {
      loadCurrentChat();
    }
    
    const unsubscribe = chatManager.addListener(() => {
      loadCurrentChat();
    });
    
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (route.params?.modelPath) {
      setShouldOpenModelSelector(true);
      setPreselectedModelPath(route.params.modelPath);
    }
    
    if (route.params?.loadChatId) {
      loadChat(route.params.loadChatId);
      navigation.setParams({ loadChatId: undefined });
    }
  }, [route.params]);

  useEffect(() => {
    return () => {
      saveMessagesDebounced.cancel();
      updateMessageContentDebounced.cancel();
      if (copyToastTimeoutRef.current) {
        clearTimeout(copyToastTimeoutRef.current);
      }
    };
  }, [saveMessagesDebounced, updateMessageContentDebounced]);

  useEffect(() => {
    const checkSystemMemory = async () => {
      try {
        const hasShownWarning = await AsyncStorage.getItem('@memory_warning_shown');
        if (hasShownWarning === 'true') {
          return;
        }

        const memory = Device.totalMemory;
        if (!memory) return;

        const memoryGB = memory / (1024 * 1024 * 1024);
        if (memoryGB < 7) {
          setShowMemoryWarning(true);
        }
      } catch (error) {
        console.error('Error checking system memory:', error);
      }
    };

    checkSystemMemory();
  }, []);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setKeyboardVisible(false);
      
      return () => {
        Keyboard.dismiss();
      };
    }, [])
  );

  const loadCurrentChat = useCallback(async () => {
    const currentChat = chatManager.getCurrentChat();
    if (currentChat) {
      setChat(currentChat);
      setMessages(currentChat.messages);
    } else {
      const newChat = await chatManager.createNewChat();
      setChat(newChat);
      setMessages(newChat.messages);
    }
  }, []);

  const saveMessages = useCallback(async (newMessages: ChatMessage[]) => {
    saveMessagesDebounced(newMessages);
  }, [saveMessagesDebounced, chat]);

  useEffect(() => {
    let subscription: { remove: () => void } | undefined;
    
    try {
      subscription = AppState.addEventListener('change', nextAppState => {
        if (
          appStateRef.current.match(/inactive|background/) && 
          nextAppState === 'active'
        ) {
          loadCurrentChat();
        } else if (
          appStateRef.current === 'active' &&
          nextAppState.match(/inactive|background/)
        ) {
          if (chat && messages.some(msg => msg.role === 'user' || msg.role === 'assistant')) {
            saveMessages(messages);
          }
        }
        
        appStateRef.current = nextAppState;
        setAppState(nextAppState);
      });
    } catch (error) {
      console.error('Error setting up AppState listener:', error);
    }

    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, [chat, messages, saveMessages, loadCurrentChat]);

  const handleSend = async (text: string) => {
    const messageText = text.trim();
    if (!messageText) return;
    
    if (!llamaManager.getModelPath() && !activeProvider) {
      setShouldOpenModelSelector(true);
      return;
    }

    try {
      setIsLoading(true);
      Keyboard.dismiss();
      
      
      const userMessage: Omit<ChatMessage, 'id'> = {
        content: messageText,
        role: 'user',
      };
      
      const success = await chatManager.addMessage(userMessage);
      if (!success) {
        showDialog(
          'Error',
          'Failed to add message to chat',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        return;
      }
      
      await processMessage();
    } catch (error) {
      console.error('Error sending message:', error);
      showDialog(
        'Error',
        'Failed to send message',
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelGeneration = useCallback(async () => {
    cancelGenerationRef.current = true;
    setIsCooldown(true);
    
    setJustCancelled(true);
    
    const currentMessageId = streamingMessageId;
    const currentContent = streamingMessage || '';
    const currentThinking = streamingThinking || '';
    
    setIsLoading(false);
    setIsRegenerating(false);
    
    if (currentMessageId) {
      const updatedMessages = messages.map(msg => {
        if (msg.id === currentMessageId) {
          return {
            ...msg,
            content: currentContent,
            thinking: currentThinking,
            stats: {
              duration: 0,
              tokens: 0
            }
          };
        }
        return msg;
      });
      
      setMessages(updatedMessages);
    }
    
    if (activeProvider === 'local') {
      try {
        await llamaManager.cancelGeneration();
      } catch (error) {
        console.error('Error cancelling generation:', error);
      }
    }
    
    if (currentMessageId && (currentContent || currentThinking)) {
      const currentChat = chatManager.getCurrentChat();
      if (currentChat) {
        await chatManager.updateMessageContent(
          currentMessageId,
          currentContent,
          currentThinking,
          {
            duration: 0,
            tokens: 0,
          }
        );
      }
    }
    
    setTimeout(() => {
      setIsStreaming(false);
      setStreamingMessageId(null);
      setStreamingMessage('');
      setStreamingThinking('');
      setStreamingStats(null);
      setIsCooldown(false);
      setJustCancelled(false);
    }, 300);
  }, [streamingMessage, streamingThinking, streamingMessageId, activeProvider, messages]);

  const handleApiError = (error: unknown, provider: 'Gemini' | 'OpenAI' | 'DeepSeek' | 'Claude') => {
    console.error(`Error with ${provider} API:`, error);
    
    if (error instanceof Error) {
      if (error.message.startsWith('QUOTA_EXCEEDED:')) {
        showDialog(
          `${provider} API Quota Exceeded`,
          `Your ${provider} API quota has been exceeded. Please try again later or upgrade your API plan.`,
          [
            <Button 
              key="settings" 
              onPress={() => {
                hideDialog();
                navigation.navigate('MainTabs', { screen: 'SettingsTab' });
              }}
            >
              Go to Settings
            </Button>,
            <Button key="ok" onPress={hideDialog}>OK</Button>
          ]
        );
        return;
      }
      
      if (error.message.startsWith('AUTHENTICATION_ERROR:')) {
        showDialog(
          `${provider} API Authentication Error`,
          `Your ${provider} API key appears to be invalid. Please check your API key in Settings.`,
          [
            <Button 
              key="settings" 
              onPress={() => {
                hideDialog();
                navigation.navigate('MainTabs', { screen: 'SettingsTab' });
              }}
            >
              Go to Settings
            </Button>,
            <Button key="ok" onPress={hideDialog}>OK</Button>
          ]
        );
        return;
      }
      
      if (error.message.startsWith('CONTENT_FILTERED:')) {
        showDialog(
          'Content Policy Violation',
          'Your request was blocked due to content policy violations. Please modify your message and try again.',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        return;
      }
      
      if (error.message.startsWith('CONTEXT_LENGTH_EXCEEDED:')) {
        showDialog(
          'Message Too Long',
          'Your message is too long for the model\'s context window. Please shorten your input or start a new chat.',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        return;
      }
      
      if (error.message.startsWith('SERVER_ERROR:')) {
        showDialog(
          `${provider} Server Error`,
          `The ${provider} API is currently experiencing issues. Please try again later.`,
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        return;
      }
      
      if (error.message.startsWith('INVALID_REQUEST:')) {
        showDialog(
          'Invalid Request',
          `The request to the ${provider} API was invalid. Please try again with different input.`,
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        return;
      }
      
      if (error.message.startsWith('PERMISSION_DENIED:')) {
        showDialog(
          'Permission Denied',
          `You don't have permission to access this ${provider} model or feature.`,
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        return;
      }
      
      if (error.message.startsWith('NOT_FOUND:')) {
        showDialog(
          'Model Not Found',
          `The requested ${provider} model was not found. It may be deprecated or unavailable.`,
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        return;
      }
      
      showDialog(
        `${provider} API Error`,
        error.message,
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
    } else {
      showDialog(
        `${provider} API Error`,
        'Unknown error occurred',
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
    }
  };

  const processMessage = async () => {
    const currentChat = chatManager.getCurrentChat();
    if (!currentChat) return;

    try {
      const currentMessages = currentChat.messages;
      const settings = llamaManager.getSettings();
      
      const isOnlineModel = activeProvider && activeProvider !== 'local';
      
      const processedMessages = currentMessages.some(msg => msg.role === 'system')
        ? currentMessages
        : [{ role: 'system', content: settings.systemPrompt, id: 'system-prompt' }, ...currentMessages];
      
      const assistantMessage: Omit<ChatMessage, 'id'> = {
        role: 'assistant',
        content: '',
        stats: {
          duration: 0,
          tokens: 0,
        }
      };
      
      await chatManager.addMessage(assistantMessage);
      const lastMessage = chatManager.getCurrentChat()?.messages.slice(-1)[0];
      if (!lastMessage) return;
      
      const messageId = lastMessage.id;
      
      setStreamingMessageId(messageId);
      setStreamingMessage('');
      setStreamingThinking('');
      setStreamingStats({ tokens: 0, duration: 0 });
      setIsStreaming(true);
      
      const startTime = Date.now();
      let tokenCount = 0;
      let fullResponse = '';
      let thinking = '';
      let isThinking = false;
      cancelGenerationRef.current = false;
      
      let updateCounter = 0;

      if (isOnlineModel) {
        const streamCallback = (partialResponse: string) => {
          if (cancelGenerationRef.current) {
            return false;
          }
          
          tokenCount = partialResponse.split(/\s+/).length;
          fullResponse = partialResponse;
          
          setStreamingMessage(partialResponse);
          setStreamingStats({
            tokens: tokenCount,
            duration: (Date.now() - startTime) / 1000
          });
          
          updateCounter++;
          if (updateCounter % 10 === 0 || 
              partialResponse.endsWith('.') || 
              partialResponse.endsWith('!') || 
              partialResponse.endsWith('?')) {
            updateMessageContentDebounced(
              messageId,
              partialResponse,
              '',
              {
                duration: (Date.now() - startTime) / 1000,
                tokens: tokenCount,
              }
            );
          }
          
          return !cancelGenerationRef.current;
        };

        if (activeProvider === 'gemini') {
          try {
            await onlineModelService.sendMessageToGemini(
              [...processedMessages]
                .filter(msg => msg.content.trim() !== '')
                .map(msg => ({ 
                  id: generateRandomId(), 
                  role: msg.role as 'system' | 'user' | 'assistant', 
                  content: msg.content 
                })),
              {
                temperature: llamaManager.getSettings().temperature,
                maxTokens: llamaManager.getSettings().maxTokens,
                topP: llamaManager.getSettings().topP,
                stream: true,
                streamTokens: true
              },
              streamCallback
            );
            
            if (!cancelGenerationRef.current) {
              await chatManager.updateMessageContent(
                messageId,
                fullResponse,
                '',
                {
                  duration: (Date.now() - startTime) / 1000,
                  tokens: tokenCount,
                }
              );
            }
          } catch (error) {
            handleApiError(error, 'Gemini');
            
            await chatManager.updateMessageContent(
              messageId,
              'Sorry, an error occurred while generating a response. Please try again.',
              '',
              {
                duration: 0,
                tokens: 0,
              }
            );
          }
        } else if (activeProvider === 'chatgpt') {
          try {
            await onlineModelService.sendMessageToOpenAI(
              [...processedMessages]
                .filter(msg => msg.content.trim() !== '')
                .map(msg => ({ 
                  id: generateRandomId(), 
                  role: msg.role as 'system' | 'user' | 'assistant', 
                  content: msg.content 
                })),
              {
                temperature: llamaManager.getSettings().temperature,
                maxTokens: llamaManager.getSettings().maxTokens,
                topP: llamaManager.getSettings().topP,
                stream: true,
                streamTokens: true
              },
              streamCallback
            );
            
            if (!cancelGenerationRef.current) {
              await chatManager.updateMessageContent(
                messageId,
                fullResponse,
                '',
                {
                  duration: (Date.now() - startTime) / 1000,
                  tokens: tokenCount,
                }
              );
            }
          } catch (error) {
            handleApiError(error, 'OpenAI');
            
            await chatManager.updateMessageContent(
              messageId,
              'Sorry, an error occurred while generating a response. Please try again.',
              '',
              {
                duration: 0,
                tokens: 0,
              }
            );
          }
        } else if (activeProvider === 'deepseek') {
          try {
            await onlineModelService.sendMessageToDeepSeek(
              [...processedMessages]
                .filter(msg => msg.content.trim() !== '')
                .map(msg => ({ 
                  id: generateRandomId(), 
                  role: msg.role as 'system' | 'user' | 'assistant', 
                  content: msg.content 
                })),
              {
                temperature: llamaManager.getSettings().temperature,
                maxTokens: llamaManager.getSettings().maxTokens,
                topP: llamaManager.getSettings().topP,
                stream: true,
                streamTokens: true
              },
              streamCallback
            );
            
            if (!cancelGenerationRef.current) {
              await chatManager.updateMessageContent(
                messageId,
                fullResponse,
                '',
                {
                  duration: (Date.now() - startTime) / 1000,
                  tokens: tokenCount,
                }
              );
            }
          } catch (error) {
            handleApiError(error, 'DeepSeek');
            
            await chatManager.updateMessageContent(
              messageId,
              'Sorry, an error occurred while generating a response. Please try again.',
              '',
              {
                duration: 0,
                tokens: 0,
              }
            );
          }
        } else if (activeProvider === 'claude') {
          try {
            await onlineModelService.sendMessageToClaude(
              [...processedMessages]
                .filter(msg => msg.content.trim() !== '')
                .map(msg => ({ 
                  id: generateRandomId(), 
                  role: msg.role as 'system' | 'user' | 'assistant', 
                  content: msg.content 
                })),
              {
                temperature: llamaManager.getSettings().temperature,
                maxTokens: llamaManager.getSettings().maxTokens,
                topP: llamaManager.getSettings().topP,
                stream: true,
                streamTokens: true
              },
              streamCallback
            );
            
            if (!cancelGenerationRef.current) {
              await chatManager.updateMessageContent(
                messageId,
                fullResponse,
                '',
                {
                  duration: (Date.now() - startTime) / 1000,
                  tokens: tokenCount,
                }
              );
            }
          } catch (error) {
            handleApiError(error, 'Claude');
            
            await chatManager.updateMessageContent(
              messageId,
              'Sorry, an error occurred while generating a response. Please try again.',
              '',
              {
                duration: 0,
                tokens: 0,
              }
            );
          }
        } else {
          await chatManager.updateMessageContent(
            messageId,
            `This model provider (${activeProvider}) is not yet implemented.`,
            '',
            {
              duration: 0,
              tokens: 0,
            }
          );
        }
      } else {
        await llamaManager.generateResponse(
          processedMessages.map(msg => ({ role: msg.role, content: msg.content })),
          (token) => {
            if (cancelGenerationRef.current) {
              return false;
            }
            
            if (token.includes('<think>')) {
              isThinking = true;
              return true;
            }
            if (token.includes('</think>')) {
              isThinking = false;
              return true;
            }
            
            tokenCount++;
            if (isThinking) {
              thinking += token;
              setStreamingThinking(thinking.trim());
            } else {
              fullResponse += token;
              setStreamingMessage(fullResponse);
            }
            
            setStreamingStats({
              tokens: tokenCount,
              duration: (Date.now() - startTime) / 1000
            });
            
            updateCounter++;
            if (updateCounter % 20 === 0) {
              updateMessageContentDebounced(
                messageId,
                fullResponse,
                thinking.trim(),
                {
                  duration: (Date.now() - startTime) / 1000,
                  tokens: tokenCount,
                }
              );
            }
            
            return !cancelGenerationRef.current;
          }
        );
      }
      
      if (!cancelGenerationRef.current) {
        await chatManager.updateMessageContent(
          messageId,
          fullResponse,
          thinking.trim(),
          {
            duration: (Date.now() - startTime) / 1000,
            tokens: tokenCount,
          }
        );
      }
      
      setIsStreaming(false);
      setStreamingMessageId(null);
      setStreamingThinking('');
      setStreamingStats(null);
      
    } catch (error) {
      console.error('Error processing message:', error);
      showDialog(
        'Error',
        'Failed to generate response',
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
      setIsStreaming(false);
      setStreamingMessageId(null);
      setStreamingThinking('');
      setStreamingStats(null);
    }
  };

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    if (Platform.OS === 'android') {
      ToastAndroid.show('Copied to clipboard', ToastAndroid.SHORT);
    } else {
      setShowCopyToast(true);
      
      if (copyToastTimeoutRef.current) {
        clearTimeout(copyToastTimeoutRef.current);
      }
      
      copyToastMessageRef.current = 'Copied to clipboard';
      
      copyToastTimeoutRef.current = setTimeout(() => {
        setShowCopyToast(false);
      }, 2000);
    }
  };

  const handleRegenerate = async () => {
    if (messages.length < 2) return;
    
    if (!llamaManager.getModelPath() && !activeProvider) {
      showDialog(
        'No Model Selected',
        'Please select a model first to regenerate a response.',
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
      return;
    }
    
    const lastUserMessageIndex = [...messages].reverse().findIndex(msg => msg.role === 'user');
    if (lastUserMessageIndex === -1) return;
    
    const newMessages = messages.slice(0, -1);
    
    const assistantMessage: ChatMessage = {
      id: generateRandomId(),
      content: '',
      role: 'assistant',
      stats: {
        duration: 0,
        tokens: 0,
      },
    };
    
    const updatedMessages = [...newMessages, assistantMessage];
    setMessages(updatedMessages);
    await saveMessages(updatedMessages);
    setIsRegenerating(true);
    cancelGenerationRef.current = false;
    
    setStreamingMessageId(assistantMessage.id);
    setStreamingMessage('');
    setStreamingThinking('');
    setStreamingStats({ tokens: 0, duration: 0 });
    setIsStreaming(true);
    
    const startTime = Date.now();
    let tokenCount = 0;
    let fullResponse = '';
    let thinking = '';
    let isThinking = false;
    
    try {
      const isOnlineModel = activeProvider && activeProvider !== 'local';
      
      if (isOnlineModel) {
        if (activeProvider === 'gemini') {
          try {
            await onlineModelService.sendMessageToGemini(
              [...newMessages]
                .filter(msg => msg.content.trim() !== '')
                .map(msg => ({ 
                  id: generateRandomId(), 
                  role: msg.role as 'system' | 'user' | 'assistant', 
                  content: msg.content 
                })),
              {
                temperature: llamaManager.getSettings().temperature,
                maxTokens: llamaManager.getSettings().maxTokens,
                topP: llamaManager.getSettings().topP,
                stream: true,
                streamTokens: true
              },
              (partialResponse) => {
                if (cancelGenerationRef.current) {
                  return false;
                }
                
                tokenCount = partialResponse.split(/\s+/).length;
                fullResponse = partialResponse;
                
                setStreamingMessage(partialResponse);
                setStreamingStats({
                  tokens: tokenCount,
                  duration: (Date.now() - startTime) / 1000
                });
                
                if (tokenCount % 5 === 0 || partialResponse.endsWith('.') || partialResponse.endsWith('!') || partialResponse.endsWith('?')) {
                  const finalMessage: ChatMessage = {
                    ...assistantMessage,
                    content: partialResponse,
                    stats: {
                      duration: (Date.now() - startTime) / 1000,
                      tokens: tokenCount,
                    }
                  };
                  
                  const finalMessages = [...newMessages, finalMessage];
                  setMessages(finalMessages);
                  saveMessages(finalMessages);
                }
                
                return !cancelGenerationRef.current;
              }
            );
            
            if (!cancelGenerationRef.current) {
              const finalMessage: ChatMessage = {
                id: assistantMessage.id,
                role: assistantMessage.role,
                content: fullResponse,
                stats: {
                  duration: (Date.now() - startTime) / 1000,
                  tokens: tokenCount,
                }
              };
              
              const finalMessages = [...newMessages, finalMessage];
              setMessages(finalMessages);
              saveMessages(finalMessages);
            }
          } catch (error) {
            handleApiError(error, 'Gemini');
            setIsRegenerating(false);
          }
        } else if (activeProvider === 'chatgpt') {
          try {
            await onlineModelService.sendMessageToOpenAI(
              [...newMessages]
                .filter(msg => msg.content.trim() !== '')
                .map(msg => ({ 
                  id: generateRandomId(), 
                  role: msg.role as 'system' | 'user' | 'assistant', 
                  content: msg.content 
                })),
              {
                temperature: llamaManager.getSettings().temperature,
                maxTokens: llamaManager.getSettings().maxTokens,
                topP: llamaManager.getSettings().topP,
                stream: true,
                streamTokens: true
              },
              (partialResponse) => {
                if (cancelGenerationRef.current) {
                  return false;
                }
                
                tokenCount = partialResponse.split(/\s+/).length;
                fullResponse = partialResponse;
                
                setStreamingMessage(partialResponse);
                setStreamingStats({
                  tokens: tokenCount,
                  duration: (Date.now() - startTime) / 1000
                });
                
                if (tokenCount % 5 === 0 || partialResponse.endsWith('.') || partialResponse.endsWith('!') || partialResponse.endsWith('?')) {
                  const finalMessage: ChatMessage = {
                    ...assistantMessage,
                    content: partialResponse,
                    stats: {
                      duration: (Date.now() - startTime) / 1000,
                      tokens: tokenCount,
                    }
                  };
                  
                  const finalMessages = [...newMessages, finalMessage];
                  setMessages(finalMessages);
                  saveMessages(finalMessages);
                }
                
                return !cancelGenerationRef.current;
              }
            );
            
            if (!cancelGenerationRef.current) {
              const finalMessage: ChatMessage = {
                id: assistantMessage.id,
                role: assistantMessage.role,
                content: fullResponse,
                stats: {
                  duration: (Date.now() - startTime) / 1000,
                  tokens: tokenCount,
                }
              };
              
              const finalMessages = [...newMessages, finalMessage];
              setMessages(finalMessages);
              saveMessages(finalMessages);
            }
          } catch (error) {
            handleApiError(error, 'OpenAI');
            setIsRegenerating(false);
          }
        } else if (activeProvider === 'deepseek') {
          try {
            await onlineModelService.sendMessageToDeepSeek(
              [...newMessages]
                .filter(msg => msg.content.trim() !== '')
                .map(msg => ({ 
                  id: generateRandomId(), 
                  role: msg.role as 'system' | 'user' | 'assistant', 
                  content: msg.content 
                })),
              {
                temperature: llamaManager.getSettings().temperature,
                maxTokens: llamaManager.getSettings().maxTokens,
                topP: llamaManager.getSettings().topP,
                stream: true,
                streamTokens: true
              },
              (partialResponse) => {
                if (cancelGenerationRef.current) {
                  return false;
                }
                
                tokenCount = partialResponse.split(/\s+/).length;
                fullResponse = partialResponse;
                
                setStreamingMessage(partialResponse);
                setStreamingStats({
                  tokens: tokenCount,
                  duration: (Date.now() - startTime) / 1000
                });
                
                if (tokenCount % 5 === 0 || partialResponse.endsWith('.') || partialResponse.endsWith('!') || partialResponse.endsWith('?')) {
                  const finalMessage: ChatMessage = {
                    ...assistantMessage,
                    content: partialResponse,
                    stats: {
                      duration: (Date.now() - startTime) / 1000,
                      tokens: tokenCount,
                    }
                  };
                  
                  const finalMessages = [...newMessages, finalMessage];
                  setMessages(finalMessages);
                  saveMessages(finalMessages);
                }
                
                return !cancelGenerationRef.current;
              }
            );
            
            if (!cancelGenerationRef.current) {
              const finalMessage: ChatMessage = {
                id: assistantMessage.id,
                role: assistantMessage.role,
                content: fullResponse,
                stats: {
                  duration: (Date.now() - startTime) / 1000,
                  tokens: tokenCount,
                }
              };
              
              const finalMessages = [...newMessages, finalMessage];
              setMessages(finalMessages);
              saveMessages(finalMessages);
            }
          } catch (error) {
            handleApiError(error, 'DeepSeek');
            setIsRegenerating(false);
          }
        } else if (activeProvider === 'claude') {
          try {
            await onlineModelService.sendMessageToClaude(
              [...newMessages]
                .filter(msg => msg.content.trim() !== '')
                .map(msg => ({ 
                  id: generateRandomId(), 
                  role: msg.role as 'system' | 'user' | 'assistant', 
                  content: msg.content 
                })),
              {
                temperature: llamaManager.getSettings().temperature,
                maxTokens: llamaManager.getSettings().maxTokens,
                topP: llamaManager.getSettings().topP,
                stream: true,
                streamTokens: true
              },
              (partialResponse) => {
                if (cancelGenerationRef.current) {
                  return false;
                }
                
                tokenCount = partialResponse.split(/\s+/).length;
                fullResponse = partialResponse;
                
                setStreamingMessage(partialResponse);
                setStreamingStats({
                  tokens: tokenCount,
                  duration: (Date.now() - startTime) / 1000
                });
                
                if (tokenCount % 5 === 0 || partialResponse.endsWith('.') || partialResponse.endsWith('!') || partialResponse.endsWith('?')) {
                  const finalMessage: ChatMessage = {
                    ...assistantMessage,
                    content: partialResponse,
                    stats: {
                      duration: (Date.now() - startTime) / 1000,
                      tokens: tokenCount,
                    }
                  };
                  
                  const finalMessages = [...newMessages, finalMessage];
                  setMessages(finalMessages);
                  saveMessages(finalMessages);
                }
                
                return !cancelGenerationRef.current;
              }
            );
            
            if (!cancelGenerationRef.current) {
              const finalMessage: ChatMessage = {
                id: assistantMessage.id,
                role: assistantMessage.role,
                content: fullResponse,
                stats: {
                  duration: (Date.now() - startTime) / 1000,
                  tokens: tokenCount,
                }
              };
              
              const finalMessages = [...newMessages, finalMessage];
              setMessages(finalMessages);
              saveMessages(finalMessages);
            }
          } catch (error) {
            handleApiError(error, 'Claude');
            setIsRegenerating(false);
          }
        } else {
          const finalMessage: ChatMessage = {
            ...assistantMessage,
            content: `This model provider (${activeProvider}) is not yet implemented.`,
            stats: {
              duration: 0,
              tokens: 0,
            }
          };
          
          const finalMessages = [...newMessages, finalMessage];
          setMessages(finalMessages);
          saveMessages(finalMessages);
        }
      } else {
        await llamaManager.generateResponse(
          [...newMessages].map(msg => ({ role: msg.role, content: msg.content })),
          (token) => {
            if (cancelGenerationRef.current) {
              return false;
            }
            
            if (token.includes('<think>')) {
              isThinking = true;
              return true;
            }
            if (token.includes('</think>')) {
              isThinking = false;
              return true;
            }
            
            tokenCount++;
            if (isThinking) {
              thinking += token;
              setStreamingThinking(thinking.trim());
            } else {
              fullResponse += token;
              setStreamingMessage(fullResponse);
            }
            
            setStreamingStats({
              tokens: tokenCount,
              duration: (Date.now() - startTime) / 1000
            });
            
            if (tokenCount % 10 === 0) {
              const finalMessage: ChatMessage = {
                ...assistantMessage,
                content: fullResponse,
                stats: {
                  duration: (Date.now() - startTime) / 1000,
                  tokens: tokenCount,
                }
              };
              
              const finalMessages = [...newMessages, finalMessage];
              setMessages(finalMessages);
              saveMessages(finalMessages);
            }
            
            return !cancelGenerationRef.current;
          }
        );
      }
      
    } catch (error) {
      console.error('Error regenerating response:', error);
      showDialog(
        'Error',
        'Failed to regenerate response',
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
    } finally {
      setIsRegenerating(false);
      setIsStreaming(false);
      setStreamingMessageId(null);
      setStreamingThinking('');
      setStreamingStats(null);
    }
  };

  const startNewChat = async () => {
    try {
      if (chat && messages.some(msg => msg.role === 'user' || msg.role === 'assistant')) {
        await saveMessages(messages);
      }
      
      const newChat = await chatManager.createNewChat();
      setChat(newChat);
      setMessages(newChat.messages);
      
      setIsStreaming(false);
      setStreamingMessageId(null);
      setStreamingMessage('');
      setStreamingThinking('');
      setStreamingStats(null);
      setIsLoading(false);
      setIsRegenerating(false);
    } catch (error) {
      console.error('Error starting new chat:', error);
    }
  };

  const loadChat = async (chatId: string) => {
    try {
      const success = await chatManager.setCurrentChat(chatId);
      
      if (success) {
        const currentChat = chatManager.getCurrentChat();
        
        if (currentChat) {
          setChat(currentChat);
          setMessages(currentChat.messages);
          
          setIsStreaming(false);
          setStreamingMessageId(null);
          setStreamingMessage('');
          setStreamingThinking('');
          setStreamingStats(null);
        }
      }
    } catch (error) {
      console.error('Error loading chat:', error);
      showDialog(
        'Error',
        'Failed to load chat',
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
    }
  };

  const handleMemoryWarningClose = async () => {
    try {
      await AsyncStorage.setItem('@memory_warning_shown', 'true');
      setShowMemoryWarning(false);
    } catch (error) {
      console.error('Error saving memory warning state:', error);
    }
  };

  const handleModelSelect = async (model: 'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude', modelPath?: string, projectorPath?: string) => {
    if (model !== 'local' && (!enableRemoteModels || !isLoggedIn)) {
      showDialog(
        'Remote Models Disabled',
        'Remote models require the "Enable Remote Models" setting to be turned on and you need to be signed in. Would you like to go to Settings to configure this?',
        [
          <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
          <Button 
            key="settings" 
            onPress={() => {
              hideDialog();
              navigation.navigate('MainTabs', { screen: 'SettingsTab' });
            }}
          >
            Go to Settings
          </Button>
        ]
      );
      return;
    }
    
    if (model === 'local') {
      if (modelPath) {
        await loadModel(modelPath, projectorPath);
      }
      setActiveProvider('local');
      chatManager.setCurrentProvider('local');
    } else {
      if (model === 'gemini') {
        const hasApiKey = await onlineModelService.hasApiKey('gemini');
        if (!hasApiKey) {
          showDialog(
            'API Key Required',
            'Please set your Gemini API key in Settings before using this model.',
            [
              <Button 
                key="settings" 
                onPress={() => {
                  hideDialog();
                  navigation.navigate('MainTabs', { screen: 'SettingsTab' });
                }}
              >
                Go to Settings
              </Button>,
              <Button key="cancel" onPress={hideDialog}>Cancel</Button>
            ]
          );
          return;
        }
        await unloadModel();
        setActiveProvider('gemini');
        setSelectedModelPath('gemini');
        chatManager.setCurrentProvider('gemini');
      } else if (model === 'chatgpt' || model === 'deepseek' || model === 'claude') {
        await unloadModel();
        setActiveProvider(model);
        setSelectedModelPath(model);
        chatManager.setCurrentProvider(model);
      }
    }
  };

  useEffect(() => {
    const handleModelChange = () => {
      const modelPath = llamaManager.getModelPath();
      if (modelPath) {
        setActiveProvider('local');
        chatManager.setCurrentProvider('local');
      } else if (activeProvider === null) {
        setActiveProvider('local');
        chatManager.setCurrentProvider('local');
      }
    };
    
    handleModelChange();
    
    const unsubscribe = llamaManager.addListener('model-loaded', handleModelChange);
    
    return () => {
      unsubscribe();
    };
  }, [activeProvider]);

  useEffect(() => {
    
    if (activeProvider) {
      chatManager.setCurrentProvider(activeProvider);
    }
  }, [activeProvider]);

  useEffect(() => {
    const checkApiKey = async () => {
      if (activeProvider && activeProvider !== 'local') {
        if (!enableRemoteModels || !isLoggedIn) {
          showDialog(
            'Remote Models Disabled',
            'Remote models require the "Enable Remote Models" setting to be turned on and you need to be signed in. Would you like to go to Settings to configure this?',
            [
              <Button key="cancel" onPress={() => {
                hideDialog();
                if (llamaManager.isInitialized()) {
                  setActiveProvider('local');
                }
              }}>
                Cancel
              </Button>,
              <Button 
                key="settings" 
                onPress={() => {
                  hideDialog();
                  navigation.navigate('MainTabs', { screen: 'SettingsTab' });
                }}
              >
                Go to Settings
              </Button>
            ]
          );
          return;
        }
        
        const hasKey = await onlineModelService.hasApiKey(activeProvider);
        if (!hasKey) {
          showDialog(
            'API Key Required',
            `${activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1)} requires an API key to function. Please add your API key in Settings.`,
            [
              <Button 
                key="settings" 
                onPress={() => {
                  hideDialog();
                  navigation.navigate('MainTabs', { screen: 'SettingsTab' });
                }}
              >
                Go to Settings
              </Button>,
              <Button 
                key="cancel" 
                onPress={() => {
                  hideDialog();
                  setActiveProvider('local');
                }}
              >
                Cancel
              </Button>
            ]
          );
        }
      }
    };
    
    checkApiKey();
  }, [activeProvider, navigation, enableRemoteModels, isLoggedIn]);

  const renderModelSelectorComponent = () => {
    let modelName = 'Select a Model';
    let iconName: keyof typeof MaterialCommunityIcons.glyphMap = "cube-outline";
    let currentModelPath = activeProvider === 'local' ? llamaManager.getModelPath() : activeProvider;
    
    if (activeProvider === 'local') {
      const modelPath = llamaManager.getModelPath();
      if (modelPath) {
        const modelFileName = modelPath.split('/').pop() || '';
        modelName = modelFileName.split('.')[0];
        iconName = "cube";
      }
    } else if (activeProvider === 'gemini') {
      modelName = 'Gemini';
      iconName = "cloud";
    } else if (activeProvider === 'chatgpt') {
      modelName = 'gpt-4o';
      iconName = "cloud";
    } else if (activeProvider === 'deepseek') {
      modelName = 'deepseek-r1';
      iconName = "cloud";
    } else if (activeProvider === 'claude') {
      modelName = 'Claude';
      iconName = "cloud";
    }
    
    return (
      <View style={styles.modelSelectorWrapper}>
        <ModelSelector 
          ref={modelSelectorRef}
          isOpen={shouldOpenModelSelector}
          onClose={() => setShouldOpenModelSelector(false)}
          preselectedModelPath={currentModelPath}
          isGenerating={isLoading || isRegenerating}
          onModelSelect={handleModelSelect}
        />
      </View>
    );
  };

  if (!chat) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
        <Text style={{marginTop: 10, color: themeColors.text}}>Loading Chat...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['bottom', 'left', 'right']}>
      <AppHeader 
        onNewChat={startNewChat}
        rightButtons={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={startNewChat}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="plus" size={22} color={themeColors.headerText} />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.navigate('ChatHistory')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="clock-outline" size={22} color={themeColors.headerText} />
            </TouchableOpacity>
          </View>
        } 
      />
      <View style={[styles.modelSelectorContainer, { borderBottomColor: themeColors.borderColor }]}>
         {renderModelSelectorComponent()}
      </View>
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={50}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modelSelectorContainer: {
    paddingBottom: 13,
  },
  chatContainer: {
    flex: 1,
  },
  modelSelectorWrapper: {
    marginBottom: 2,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 15,
    marginHorizontal: 16,
  },
  inputContainer: {
    width: '100%',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  bulletPoints: {
    marginVertical: 12,
    paddingLeft: 8,
  },
  bulletPoint: {
    fontSize: 15,
    lineHeight: 24,
  },
  modalButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  messageContainer: {
    marginVertical: 4,
    width: '100%',
    paddingHorizontal: 8,
  },
  messageCard: {
    maxWidth: '85%',
    borderRadius: 20,
    marginVertical: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  roleLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
    opacity: 0.7,
  },
  messageContent: {
    padding: 12,
    paddingTop: 8,
    overflow: 'visible',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    overflow: 'visible',
  },
  markdownWrapper: {
    padding: 12,
    paddingTop: 8,
    overflow: 'visible',
  },
  copyButton: {
    padding: 4,
    borderRadius: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    overflow: 'visible',
  },
  statsText: {
    fontSize: 11,
    opacity: 0.7,
  },
  regenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    padding: 4,
    borderRadius: 4,
    opacity: 0.8,
  },
  regenerateButtonDisabled: {
    opacity: 0.5,
  },
  regenerateButtonText: {
    fontSize: 12,
    marginLeft: 4,
  },
  thinkingContainer: {
    marginBottom: 4,
    paddingHorizontal: 12,
    marginTop: -4,
  },
  thinkingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  thinkingIcon: {
    marginRight: 4,
  },
  thinkingLabel: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.8,
  },
  thinkingText: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
    marginLeft: 18,
  },
  codeBlock: {
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 12,
    marginVertical: 4,
    position: 'relative',
    minHeight: 40,
  },
  codeBlockCopyButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    padding: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 1,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 