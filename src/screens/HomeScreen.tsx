import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Platform,
  TouchableOpacity,
  Alert,
  Modal,
  Keyboard,
  AppState,
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  ToastAndroid,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ModelSelector from '../components/ModelSelector';
import { llamaManager } from '../utils/LlamaManager';
import AppHeader from '../components/AppHeader';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import * as Device from 'expo-device';
import chatManager, { Chat, ChatMessage } from '../utils/ChatManager';
import { getThemeAwareColor } from '../utils/ColorUtils';
import ChatView, { Message } from '../components/ChatView';
import ChatInput from '../components/ChatInput';
import { onlineModelService } from '../services/OnlineModelService';
import { useModel } from '../context/ModelContext';

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  route: RouteProp<TabParamList, 'HomeTab'>;
};

const generateRandomId = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

export default function HomeScreen({ route, navigation }: HomeScreenProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const modelSelectorRef = useRef<{ refreshModels: () => void }>(null);
  const [shouldOpenModelSelector, setShouldOpenModelSelector] = useState(false);
  const [preselectedModelPath, setPreselectedModelPath] = useState<string | null>(null);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const copyToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const copyToastMessageRef = useRef<string>('Copied to clipboard');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const cancelGenerationRef = useRef<boolean>(false);
  const [showMemoryWarning, setShowMemoryWarning] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [streamingThinking, setStreamingThinking] = useState<string>('');
  const [streamingStats, setStreamingStats] = useState<{ tokens: number; duration: number } | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const [appState, setAppState] = useState(appStateRef.current);
  const isFirstLaunchRef = useRef(true);
  const [activeProvider, setActiveProvider] = useState<'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude' | null>(null);
  const { loadModel, unloadModel, setSelectedModelPath } = useModel();

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
      if (copyToastTimeoutRef.current) {
        clearTimeout(copyToastTimeoutRef.current);
      }
    };
  }, []);

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
    if (chat) {
      await chatManager.updateChatMessages(chat.id, newMessages);
    }
  }, [chat]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
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

    return () => {
      subscription.remove();
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
        Alert.alert('Error', 'Failed to add message to chat');
        return;
      }
      
      await processMessage();
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelGeneration = useCallback(() => {
    cancelGenerationRef.current = true;
    
    if (streamingMessageId && (streamingMessage || streamingThinking)) {
      const currentChat = chatManager.getCurrentChat();
      if (currentChat) {
        chatManager.updateMessageContent(
          streamingMessageId,
          streamingMessage || '',
          streamingThinking || '',
          {
            duration: 0,
            tokens: 0,
          }
        );
      }
    }
    
    setIsStreaming(false);
    setStreamingMessageId(null);
    setIsLoading(false);
    setIsRegenerating(false);
  }, [streamingMessage, streamingThinking, streamingMessageId]);

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

      if (isOnlineModel) {
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
                  chatManager.updateMessageContent(
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
              }
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
            console.error('Error with Gemini API:', error);
            Alert.alert('Gemini API Error', error instanceof Error ? error.message : 'Unknown error');
            
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
          async (token) => {
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
      Alert.alert('Error', 'Failed to generate response');
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
      Alert.alert('No Model Selected', 'Please select a model first to regenerate a response.');
      return;
    }
    
    const lastUserMessageIndex = [...messages].reverse().findIndex(msg => msg.role === 'user');
    if (lastUserMessageIndex === -1) return;
    
    const newMessages = messages.slice(0, -1);
    
    const assistantMessage: Message = {
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
                  const finalMessage: Message = {
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
              const finalMessage: Message = {
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
              await saveMessages(finalMessages);
            }
          } catch (error) {
            console.error('Error with Gemini API regeneration:', error);
            Alert.alert('Gemini API Error', error instanceof Error ? error.message : 'Unknown error');
            setIsRegenerating(false);
          }
        } else {
          const finalMessage: Message = {
            ...assistantMessage,
            content: `This model provider (${activeProvider}) is not yet implemented.`,
            stats: {
              duration: 0,
              tokens: 0,
            }
          };
          
          const finalMessages = [...newMessages, finalMessage];
          setMessages(finalMessages);
          await saveMessages(finalMessages);
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
              const finalMessage: Message = {
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
      Alert.alert('Error', 'Failed to regenerate response');
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
      Alert.alert('Error', 'Failed to load chat');
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

  const handleModelSelect = async (model: 'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude', modelPath?: string) => {
    if (model === 'local') {
      if (modelPath) {
        await loadModel(modelPath);
      }
      setActiveProvider('local');
    } else {
      if (model === 'gemini') {
        const hasApiKey = await onlineModelService.hasApiKey('gemini');
        if (!hasApiKey) {
          Alert.alert(
            'API Key Required',
            'Please set your Gemini API key in Settings before using this model.',
            [
              { 
                text: 'Go to Settings', 
                onPress: () => navigation.navigate('Settings')
              },
              { text: 'Cancel', style: 'cancel' }
            ]
          );
          return;
        }
        await unloadModel();
        setActiveProvider('gemini');
        setSelectedModelPath('gemini');
      } else if (model === 'chatgpt' || model === 'deepseek' || model === 'claude') {
        await unloadModel();
        setActiveProvider(model);
        setSelectedModelPath(model);
      }
    }
  };

  useEffect(() => {
    const handleModelChange = () => {
      const modelPath = llamaManager.getModelPath();
      if (modelPath) {
        setActiveProvider('local');
      } else if (activeProvider === null) {
        setActiveProvider('local');
      }
    };
    
    handleModelChange();
    
    const unsubscribe = llamaManager.addListener('model-loaded', handleModelChange);
    
    return () => {
      unsubscribe();
    };
  }, [activeProvider]);

  useEffect(() => {
    const checkApiKey = async () => {
      if (activeProvider && activeProvider !== 'local') {
        const hasKey = await onlineModelService.hasApiKey(activeProvider);
        if (!hasKey) {
          Alert.alert(
            'API Key Required',
            `${activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1)} requires an API key to function. Please add your API key in Settings.`,
            [
              {
                text: 'Go to Settings',
                onPress: () => navigation.navigate('Settings')
              },
              {
                text: 'Cancel',
                onPress: () => setActiveProvider('local')
              }
            ]
          );
        }
      }
    };
    
    checkApiKey();
  }, [activeProvider, navigation]);

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
      modelName = 'Gemini Pro';
      iconName = "cloud";
    } else if (activeProvider === 'chatgpt') {
      modelName = 'GPT-4o';
      iconName = "cloud";
    } else if (activeProvider === 'deepseek') {
      modelName = 'DeepSeek Coder';
      iconName = "cloud";
    } else if (activeProvider === 'claude') {
      modelName = 'Claude 3 Opus';
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

  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: themeColors.background }]}
      edges={['right', 'left']}
    >
      <AppHeader 
        onNewChat={startNewChat}
        title="Ragionare"
        showLogo={true}
      />
      
      {showCopyToast && (
        <View style={styles.copyToast}>
          <Text style={styles.copyToastText}>{copyToastMessageRef.current}</Text>
        </View>
      )}

      <Modal
        visible={showMemoryWarning}
        transparent
        animationType="fade"
        onRequestClose={handleMemoryWarningClose}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.borderColor }]}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="alert-outline" size={32} color={getThemeAwareColor('#FFA726', currentTheme)} />
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Low Memory Warning
              </Text>
            </View>
            
            <Text style={[styles.modalText, { color: themeColors.text }]}>
              Your device has less than 8GB of RAM. Large language models require significant memory to run efficiently. You may experience:
            </Text>
            
            <View style={styles.bulletPoints}>
              <Text style={[styles.bulletPoint, { color: themeColors.text }]}>• Slower response times</Text>
              <Text style={[styles.bulletPoint, { color: themeColors.text }]}>• Potential app crashes</Text>
              <Text style={[styles.bulletPoint, { color: themeColors.text }]}>• Limited model size support</Text>
            </View>
            
            <Text style={[styles.modalText, { color: themeColors.text, marginTop: 8 }]}>
              Although, you can still continue using this app, but for optimal performance, consider using a phone with more RAM.
            </Text>

            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: themeColors.headerBackground }]}
              onPress={handleMemoryWarningClose}
            >
              <Text style={styles.modalButtonText}>I Understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {renderModelSelectorComponent()}
      
      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        enabled={true}>
        <View style={[styles.messagesContainer]}>
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
            flatListRef={flatListRef}
          />
        </View>

        <View style={[
          styles.inputContainer,
          { 
            backgroundColor: themeColors.background,
            borderTopWidth: 1,
            borderTopColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          }
        ]}>
          <ChatInput
            onSend={handleSend}
            disabled={isLoading || isStreaming}
            isLoading={isLoading || isStreaming}
            onCancel={handleCancelGeneration}
            placeholderColor={currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)'}
            style={{ 
              backgroundColor: themeColors.background,
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  messagesContainer: {
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
}); 