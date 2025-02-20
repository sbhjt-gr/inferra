import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import ModelSelector from '../components/ModelSelector';
import { llamaManager } from '../utils/LlamaManager';
import AppHeader from '../components/AppHeader';
import { useFocusEffect } from '@react-navigation/native';
import Markdown from 'react-native-markdown-display';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Menu, MenuItem } from 'react-native-material-menu';
import { useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';

type Message = {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  thinking?: string;
  stats?: {
    duration: number;
    tokens: number;
  };
};

type ModelMemoryInfo = {
  requiredMemory: number;
  availableMemory: number;
};

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  route: RouteProp<TabParamList, 'HomeTab'>;
};

const LoadingDialog = ({ visible }: { visible: boolean }) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];

  if (!visible) return null;

  return (
    <View style={styles.loadingOverlay}>
      <View style={[styles.loadingDialog, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingContent}>
          <View style={styles.loadingIconContainer}>
            <ActivityIndicator size="large" color="#4a0660" />
            <View style={styles.loadingPulse} />
          </View>
          
          <View style={styles.loadingTextContainer}>
            <Text style={[styles.loadingTitle, { color: themeColors.text }]}>
              Loading Model
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const extractCodeFromFence = (content: string): string => {
  const codeMatch = content.match(/```[\s\S]*?\n([\s\S]*?)```/);
  return codeMatch ? codeMatch[1].trim() : '';
};

export default function HomeScreen({ route, navigation }: HomeScreenProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const modelSelectorRef = useRef<{ refreshModels: () => void }>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [chatHistories, setChatHistories] = useState<{ id: string, messages: Message[], timestamp: number }[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>(Date.now().toString());

  useFocusEffect(
    useCallback(() => {
      modelSelectorRef.current?.refreshModels();
    }, [])
  );

  useEffect(() => {
    loadMessages();
    loadChatHistories();
  }, []);

  useEffect(() => {
    if (route.params?.chatId) {
      const selectedChat = chatHistories.find(chat => chat.id === route.params.chatId);
      if (selectedChat) {
        setCurrentChatId(route.params.chatId);
        setMessages(selectedChat.messages);
        saveMessages(selectedChat.messages);
      }
    }
  }, [route.params?.chatId, chatHistories]);

  const loadMessages = async () => {
    try {
      const savedMessages = await AsyncStorage.getItem('chatMessages');
      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const saveMessages = async (newMessages: Message[]) => {
    try {
      await AsyncStorage.setItem('chatMessages', JSON.stringify(newMessages));
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    if (!llamaManager.getModelPath()) {
      alert('Please select a model first');
      return;
    }

    try {
      // Check memory before proceeding
      const memoryInfo = await llamaManager.checkMemoryRequirements();
      
      // Only show memory warning if we have valid memory info
      if (memoryInfo.requiredMemory > 0 && memoryInfo.availableMemory > 0 && 
          memoryInfo.availableMemory < memoryInfo.requiredMemory) {
        const requiredGB = (memoryInfo.requiredMemory / 1024 / 1024 / 1024).toFixed(1);
        const availableGB = (memoryInfo.availableMemory / 1024 / 1024 / 1024).toFixed(1);
        
        Alert.alert(
          'Insufficient Memory',
          `This model requires ${requiredGB}GB of RAM but only ${availableGB}GB is available. The app might crash or perform poorly. Do you want to continue?`,
          [
            {
              text: 'Cancel',
              style: 'cancel'
            },
            {
              text: 'Continue Anyway',
              onPress: () => processMessage(),
              style: 'destructive'
            }
          ]
        );
        return;
      }

      await processMessage();

    } catch (error) {
      console.error('Error:', error);
      if (error instanceof Error && error.message.includes('memory')) {
        Alert.alert(
          'Out of Memory',
          'Your device ran out of memory while processing. Try using a smaller model or closing other apps.'
        );
      } else {
        alert('Failed to generate response');
      }
    }
  };

  const processMessage = async () => {
    if (!message.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: message.trim(),
      role: 'user',
    };

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: '',
      role: 'assistant',
      stats: {
        duration: 0,
        tokens: 0,
      },
    };

    const newMessages = [...messages, userMessage, assistantMessage];
    setMessages(newMessages);
    await saveMessages(newMessages);
    setMessage('');
    setIsLoading(true);

    const startTime = Date.now();
    let tokenCount = 0;
    let fullResponse = '';
    let thinking = '';
    let isThinking = false;

    try {
      await llamaManager.generateResponse(
        [
          {
            role: 'system',
            content: 'You are a helpful AI assistant.',
          },
          ...messages,
          userMessage,
        ].map(msg => ({ role: msg.role, content: msg.content })),
        (token) => {
          tokenCount++; // Increment token count for every token

          if (token.includes('<think>')) {
            isThinking = true;
            return;
          }
          if (token.includes('</think>')) {
            isThinking = false;
            return;
          }

          if (isThinking) {
            thinking += token;
          } else {
            fullResponse += token;
          }

          setMessages(prev => {
            const updated = [...prev];
            const lastMessage = updated[updated.length - 1];
            if (lastMessage.role === 'assistant') {
              updated[updated.length - 1] = {
                ...lastMessage,
                content: fullResponse,
                thinking: thinking,
                stats: {
                  duration: (Date.now() - startTime) / 1000,
                  tokens: tokenCount,
                },
              };
            }
            return updated;
          });
        }
      );

      // Final message update
      setMessages(prev => {
        const updated = [...prev];
        const lastMessage = updated[updated.length - 1];
        if (lastMessage.role === 'assistant') {
          updated[updated.length - 1] = {
            ...lastMessage,
            content: fullResponse,
            thinking: thinking,
            stats: {
              duration: (Date.now() - startTime) / 1000,
              tokens: tokenCount,
            },
          };
        }
        return updated;
      });

      await saveMessages(messages);
    } catch (error) {
      console.error('Error generating response:', error);
      Alert.alert('Error', 'Failed to generate response');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = useCallback(({ item }: { item: Message }) => (
    <View>
      {item.role === 'assistant' && item.thinking && (
        <View style={[styles.thinkingBubble, { backgroundColor: themeColors.borderColor }]}>
          <Text style={[styles.thinkingText, { color: themeColors.secondaryText }]}>
            Reasoning:
          </Text>
          <Text style={[styles.thinkingContent, { color: themeColors.text }]}>
            {item.thinking}
          </Text>
        </View>
      )}
      <View
        style={[
          styles.messageBubble,
          item.role === 'user' ? styles.userMessage : styles.assistantMessage,
          {
            backgroundColor:
              item.role === 'user' ? themeColors.headerBackground : themeColors.borderColor,
          },
        ]}
      >
        <Markdown
          style={{
            body: {
              color: item.role === 'user' ? '#fff' : themeColors.text,
              fontSize: 16,
              lineHeight: 22,
            },
            paragraph: {
              marginVertical: 0,
            },
            code_block: styles.codeBlockContainer,
            fence: styles.codeBlockContainer,
          }}
        >
          {item.content}
        </Markdown>
      </View>
      {item.role === 'assistant' && item.stats && (
        <View style={styles.statsContainer}>
          <Text style={[styles.statsText, { color: themeColors.secondaryText }]}>
            {`${item.stats.tokens.toLocaleString()} tokens • ${item.stats.duration.toFixed(1)}s`}
          </Text>
        </View>
      )}
    </View>
  ), [themeColors]);

  const startNewChat = async () => {
    const newChatId = Date.now().toString();
    
    try {
      // Save current chat if it has messages
      if (messages.length > 0) {
        const updatedHistories = [...chatHistories, {
          id: currentChatId,
          messages,
          timestamp: Date.now()
        }];
        
        // Update AsyncStorage first
        await AsyncStorage.setItem('chatHistories', JSON.stringify(updatedHistories));
        // Then update state
        setChatHistories(updatedHistories);
        
        // Clear current chat messages
        setMessages([]);
        await AsyncStorage.setItem('chatMessages', JSON.stringify([]));
      }
      
      setCurrentChatId(newChatId);
    } catch (error) {
      console.error('Error starting new chat:', error);
    }
  };

  const loadChatHistories = async () => {
    try {
      const savedHistories = await AsyncStorage.getItem('chatHistories');
      if (savedHistories) {
        const parsed = JSON.parse(savedHistories);
        if (Array.isArray(parsed)) {
          setChatHistories(parsed);
        } else {
          setChatHistories([]);
        }
      } else {
        setChatHistories([]);
      }
    } catch (error) {
      console.error('Error loading chat histories:', error);
      setChatHistories([]);
    }
  };

  const loadChat = async (chatId: string) => {
    const selectedChat = chatHistories.find(chat => chat.id === chatId);
    if (selectedChat) {
      // Save current chat if it has messages and is different from the one being loaded
      if (messages.length > 0 && currentChatId !== chatId) {
        const updatedHistories = chatHistories.map(chat => 
          chat.id === currentChatId 
            ? { id: currentChatId, messages, timestamp: Date.now() } 
            : chat
        );
        
        // Add current chat to history if it's not already there
        if (!updatedHistories.some(chat => chat.id === currentChatId)) {
          updatedHistories.push({ 
            id: currentChatId, 
            messages, 
            timestamp: Date.now() 
          });
        }
        
        setChatHistories(updatedHistories);
        await AsyncStorage.setItem('chatHistories', JSON.stringify(updatedHistories));
      }
      
      // Load the selected chat
      setCurrentChatId(chatId);
      setMessages(selectedChat.messages);
      await AsyncStorage.setItem('chatMessages', JSON.stringify(selectedChat.messages));
    }
  };

  const handleChatDeleted = (deletedChatId: string) => {
    if (currentChatId === deletedChatId) {
      setCurrentChatId(Date.now().toString());
      setMessages([]);
      saveMessages([]);
    }
    // Also update chat histories
    loadChatHistories();
  };

  const handleAllChatsDeleted = () => {
    setCurrentChatId(Date.now().toString());
    setMessages([]);
    saveMessages([]);
    setChatHistories([]);
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <AppHeader />
      
      <View style={styles.headerButtons}>
        <TouchableOpacity
          style={[styles.headerButton, { backgroundColor: themeColors.headerBackground }]}
          onPress={startNewChat}
        >
          <Ionicons name="add-outline" size={22} color="#fff" />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.headerButton, { backgroundColor: themeColors.headerBackground }]}
          onPress={() => navigation.navigate('ChatHistory', {
            onChatDeleted: handleChatDeleted,
            onAllChatsDeleted: handleAllChatsDeleted,
          })}
        >
          <Ionicons name="time-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoidingView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.content}>
          <View style={styles.modelSelectorWrapper}>
            <ModelSelector 
              ref={modelSelectorRef}
              onModelSelect={async (modelPath) => {
                try {
                  setIsModelLoading(true);
                  await llamaManager.initializeModel(modelPath);
                  Alert.alert('Success', 'Model loaded successfully');
                } catch (error) {
                  Alert.alert(
                    'Model Error',
                    'Failed to initialize the model. Please try another model or restart the app.'
                  );
                } finally {
                  setIsModelLoading(false);
                }
              }}
              onModelUnload={async () => {
                try {
                  setIsModelLoading(true);
                  await llamaManager.release();
                } catch (error) {
                  console.error('Error unloading model:', error);
                } finally {
                  setIsModelLoading(false);
                }
              }}
            />
          </View>

          <View style={styles.chatContainer}>
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons 
                  name="chatbubble-ellipses-outline" 
                  size={48} 
                  color={themeColors.secondaryText} 
                />
                <Text style={[styles.emptyStateText, { color: themeColors.secondaryText }]}>
                  Select a model and start chatting
                </Text>
              </View>
            ) : (
              <FlatList
                ref={flatListRef}
                data={[...messages].reverse()}
                renderItem={renderMessage}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.messageList}
                inverted={true}
                maintainVisibleContentPosition={{
                  minIndexForVisible: 0,
                }}
              />
            )}
          </View>

          <View
            style={[
              styles.inputContainer,
              { backgroundColor: themeColors.borderColor },
              isLoading && styles.inputContainerDisabled
            ]}
          >
            <TextInput
              style={[
                styles.input,
                { 
                  color: themeColors.text,
                  maxHeight: 100
                }
              ]}
              value={message}
              onChangeText={setMessage}
              placeholder={isLoading ? "Model is processing..." : "Type a message..."}
              placeholderTextColor={themeColors.secondaryText}
              multiline
              editable={!isLoading}
            />
            {isLoading ? (
              <ActivityIndicator
                size="small"
                color={themeColors.headerBackground}
                style={styles.sendButton}
              />
            ) : (
              <TouchableOpacity
                onPress={handleSend}
                style={[
                  styles.sendButton,
                  {
                    backgroundColor: message.trim()
                      ? themeColors.headerBackground
                      : themeColors.borderColor,
                  },
                ]}
                disabled={!message.trim() || isLoading}
              >
                <Ionicons
                  name="send"
                  size={20}
                  color={message.trim() ? '#fff' : themeColors.secondaryText}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
      
      <LoadingDialog visible={isModelLoading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
    paddingTop: 20,
  },
  chatContainer: {
    flex: 1,
    marginTop: 8,
  },
  messageList: {
    flexGrow: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    width: '100%',
  },
  messageBubble: {
    maxWidth: '85%',
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: 16,
    marginVertical: 4,
    marginHorizontal: 16,
  },
  userMessage: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    borderRadius: 24,
    marginTop: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modelSelectorWrapper: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  inputContainerDisabled: {
    opacity: 0.7,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingDialog: {
    width: '85%',
    maxWidth: 320,
    borderRadius: 24,
    padding: 24,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  loadingContent: {
    alignItems: 'center',
  },
  loadingIconContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingPulse: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
    transform: [{ scale: 1 }],
    opacity: 0.5,
  },
  loadingTextContainer: {
    alignItems: 'center',
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  loadingSteps: {
    width: '100%',
    gap: 12,
  },
  loadingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(74, 6, 96, 0.05)',
    padding: 12,
    borderRadius: 12,
  },
  loadingStepText: {
    fontSize: 14,
    flex: 1,
  },
  codeBlockContainer: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    marginVertical: 4,
    position: 'relative',
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    color: '#fff',
    paddingRight: 40,
  },
  copyButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  statsContainer: {
    marginHorizontal: 16,
    marginTop: 4,
  },
  statsText: {
    fontSize: 12,
    opacity: 0.7,
  },
  thinkingBubble: {
    padding: 12,
    borderRadius: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  thinkingText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  thinkingContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  headerButtons: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 16,
    right: 16,
    flexDirection: 'row',
    gap: 8,
    zIndex: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 