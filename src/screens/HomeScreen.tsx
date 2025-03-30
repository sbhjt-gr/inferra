import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Clipboard,
  ToastAndroid,
  Modal,
  Keyboard,
  KeyboardEvent,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import ModelSelector from '../components/ModelSelector';
import { llamaManager } from '../utils/LlamaManager';
import AppHeader from '../components/AppHeader';
import { useFocusEffect } from '@react-navigation/native';
import Markdown from 'react-native-markdown-display';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import { useModel } from '../context/ModelContext';
import * as Device from 'expo-device';
import chatManager, { Chat, ChatMessage } from '../utils/ChatManager';
import { getThemeAwareColor } from '../utils/ColorUtils';

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

const extractCodeFromFence = (content: string): string => {
  const codeMatch = content.match(/```[\s\S]*?\n([\s\S]*?)```/);
  return codeMatch ? codeMatch[1].trim() : '';
};

// Helper functions for code blocks
const hasCodeBlock = (content: string): boolean => {
  return content.includes('```') || content.includes('`');
};

const extractAllCodeBlocks = (content: string): string[] => {
  const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
  const codeBlocks: string[] = [];
  
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    codeBlocks.push(match[1]);
  }
  
  return codeBlocks;
};

// Create custom renderers for selectable text
const createSelectableRenderer = (defaultRenderer: any) => (node: any, children: any, parent: any, styles: any) => {
  const defaultOutput = defaultRenderer(node, children, parent, styles);
  if (defaultOutput && defaultOutput.type === Text) {
    return React.cloneElement(defaultOutput, { selectable: true });
  }
  return defaultOutput;
};

// Component for code blocks
const CodeBlock = ({ content, style }: { content: string, style?: any }) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  
  return (
    <View style={[styles.codeBlock, style]}>
      <Text 
        selectable={true}
        style={[
          styles.codeText,
          { color: currentTheme === 'dark' ? '#E4E4E4' : '#000' }
        ]}
      >
        {content}
      </Text>
      <TouchableOpacity 
        style={styles.codeBlockCopyButton}
        onPress={() => Clipboard.setString(content)}
        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
      >
        <Ionicons 
          name="copy-outline" 
          size={14} 
          color={themeColors.headerText} 
        />
      </TouchableOpacity>
    </View>
  );
};

const hasMarkdownFormatting = (content: string): boolean => {
  // Check for common markdown syntax
  const markdownPatterns = [
    /```/,           // Code blocks
    /`[^`]+`/,       // Inline code
    /\*\*[^*]+\*\*/,  // Bold
    /\*[^*]+\*/,      // Italic
    /^#+\s/m,         // Headers
    /\[[^\]]+\]\([^)]+\)/,  // Links
    /^\s*[-*+]\s/m,   // Unordered lists
    /^\s*\d+\.\s/m,   // Ordered lists
    /^\s*>\s/m,       // Blockquotes
    /~~[^~]+~~/,      // Strikethrough
    /\|\s*[^|]+\s*\|/  // Tables
  ];

  return markdownPatterns.some(pattern => pattern.test(content));
};

// Add generateRandomId function at the top level
const generateRandomId = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

// Update ChatInput component usage
const ChatInput = ({ 
  onSend, 
  disabled = false,
  isLoading = false,
  onCancel = () => {},
  style = {},
  placeholderColor = 'rgba(0, 0, 0, 0.6)'
}: { 
  onSend: (text: string) => void,
  disabled?: boolean,
  isLoading?: boolean,
  onCancel?: () => void,
  style?: any,
  placeholderColor?: string
}) => {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(48);
  const inputRef = useRef<TextInput>(null);
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const isDark = currentTheme === 'dark';

  const handleSend = () => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
    setInputHeight(48); // Reset height after sending
  };

  const handleContentSizeChange = (event: any) => {
    const height = Math.min(120, Math.max(48, event.nativeEvent.contentSize.height));
    setInputHeight(height);
  };

  return (
    <View style={[inpStyles.container, style]}>
      <View style={[
        inpStyles.inputWrapper,
        isDark && { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
        { height: inputHeight }
      ]}>
        <TextInput
          ref={inputRef}
          style={[
            inpStyles.input,
            isDark && { color: '#fff' },
          ]}
          value={text}
          onChangeText={setText}
          placeholder="Send a message..."
          placeholderTextColor={placeholderColor}
          multiline
          editable={!disabled}
          textAlignVertical="center"
          returnKeyType="default"
          blurOnSubmit={false}
          onContentSizeChange={handleContentSizeChange}
          keyboardAppearance={isDark ? 'dark' : 'light'}
        />
      </View>
      
      {isLoading ? (
        <View style={inpStyles.loadingContainer}>
          <ActivityIndicator
            size="small"
            color={getThemeAwareColor('#0084ff', currentTheme)}
            style={inpStyles.loadingIndicator}
          />
          <TouchableOpacity
            onPress={onCancel}
            style={inpStyles.cancelButton}
          >
            <Ionicons name="close" size={24} color={themeColors.headerText} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity 
          style={[
            inpStyles.sendButton,
            !text.trim() && inpStyles.sendButtonDisabled
          ]} 
          onPress={handleSend}
          disabled={!text.trim() || disabled}
        >
          <Ionicons 
            name="send" 
            size={24} 
            color={text.trim() ? getThemeAwareColor('#660880', currentTheme) : isDark ? themeColors.secondaryText : '#999'} 
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

export default function HomeScreen({ route, navigation }: HomeScreenProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const modelSelectorRef = useRef<{ refreshModels: () => void }>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [shouldOpenModelSelector, setShouldOpenModelSelector] = useState(false);
  const [preselectedModelPath, setPreselectedModelPath] = useState<string | null>(null);
  const { isModelLoading, unloadModel } = useModel();
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
  // Track if this is the first launch
  const isFirstLaunchRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      modelSelectorRef.current?.refreshModels();
    }, [])
  );

  useEffect(() => {
    // Create a new chat only on first launch
    if (isFirstLaunchRef.current) {
      startNewChat();
      isFirstLaunchRef.current = false;
    } else {
      // Otherwise load the current chat
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
    
    // Handle loadChatId parameter from ChatHistoryScreen
    if (route.params?.loadChatId) {
      loadChat(route.params.loadChatId);
      // Clear the parameter to prevent reloading on future renders
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
        // Check if warning has been shown before
        const hasShownWarning = await AsyncStorage.getItem('@memory_warning_shown');
        if (hasShownWarning === 'true') {
          return;
        }

        // Get device memory
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

  // Single effect to handle keyboard
  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        // Hide tab bar
        if (navigation?.getParent()) {
          navigation.getParent()?.setOptions({
            tabBarStyle: { display: 'none' }
          });
        }
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
        // Show tab bar
        if (navigation?.getParent()) {
          navigation.getParent()?.setOptions({
            tabBarStyle: {
              display: 'flex',
              backgroundColor: themeColors.tabBarBackground,
              height: 60 + (Platform.OS === 'ios' ? 20 : 0),
              paddingTop: 10,
              paddingBottom: Platform.OS === 'ios' ? 20 : 0,
              borderTopWidth: 0,
            }
          });
        }
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [navigation, themeColors]);

  // Handle screen focus
  useFocusEffect(
    useCallback(() => {
      // Reset keyboard state when screen comes into focus
      setKeyboardVisible(false);
      
      // Show tab bar
      if (navigation?.getParent()) {
        navigation.getParent()?.setOptions({
          tabBarStyle: {
            display: 'flex',
            backgroundColor: themeColors.tabBarBackground,
            height: 60 + (Platform.OS === 'ios' ? 20 : 0),
            paddingTop: 10,
            paddingBottom: Platform.OS === 'ios' ? 20 : 0,
            borderTopWidth: 0,
          }
        });
      }

      return () => {
        // Cleanup on blur
        Keyboard.dismiss();
      };
    }, [navigation, themeColors])
  );

  // Add AppState change handler
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appStateRef.current.match(/inactive|background/) && 
        nextAppState === 'active'
      ) {
        // App has come to foreground - just load the current chat
        loadCurrentChat();
      } else if (
        appStateRef.current === 'active' &&
        nextAppState.match(/inactive|background/)
      ) {
        // App is going to background, save current chat only if it has messages
        if (chat && messages.some(msg => msg.role === 'user' || msg.role === 'assistant')) {
          chatManager.saveAllChats();
        }
      }
      
      appStateRef.current = nextAppState;
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, [chat, messages]);

  const loadCurrentChat = useCallback(async () => {
    const currentChat = chatManager.getCurrentChat();
    if (currentChat) {
      setChat(currentChat);
      setMessages(currentChat.messages);
    } else {
      // Create a new chat if none exists
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

  const handleSend = async (text: string) => {
    const messageText = text.trim();
    if (!messageText) return;
    
    if (!llamaManager.getModelPath()) {
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
    // Access the context directly from llamaManager
    if (llamaManager.context) {
      llamaManager.context.stopCompletion();
    }
    
    // Save the current partial response before canceling
    if (streamingMessageId && (streamingMessage || streamingThinking)) {
      const currentChat = chatManager.getCurrentChat();
      if (currentChat) {
        chatManager.updateMessageContent(
          streamingMessageId,
          streamingMessage || '',  // Keep the current response
          streamingThinking || '', // Keep the current thinking
          {
            duration: 0,
            tokens: 0,
          }
        );
      }
    }
    
    // Reset streaming and loading states but keep the message content
    setIsStreaming(false);
    setStreamingMessageId(null);
    setIsLoading(false);
    setIsRegenerating(false);
    cancelGenerationRef.current = true;
  }, [streamingMessage, streamingThinking, streamingMessageId]);

  const processMessage = async () => {
    const currentChat = chatManager.getCurrentChat();
    if (!currentChat) return;

    try {
      const currentMessages = currentChat.messages;
      const settings = llamaManager.getSettings();
      
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
      const messageId = currentChat.messages[currentChat.messages.length - 1].id;
      
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
            
            // Update the streaming message immediately to show real-time formatting
            setStreamingMessage(fullResponse);
          }
          
          // Update streaming stats in real-time
          setStreamingStats({
            tokens: tokenCount,
            duration: (Date.now() - startTime) / 1000
          });
          
          // Update message content in real-time (this will now save to AsyncStorage)
          if (tokenCount % 10 === 0) { // Update every 10 tokens to reduce overhead
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
      
      // Only update if not cancelled
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
      // Show iOS toast
      setShowCopyToast(true);
      
      // Clear any existing timeout
      if (copyToastTimeoutRef.current) {
        clearTimeout(copyToastTimeoutRef.current);
      }
      
      // Use a ref to store the toast message
      copyToastMessageRef.current = 'Copied to clipboard';
      
      // Hide toast after 2 seconds
      copyToastTimeoutRef.current = setTimeout(() => {
        setShowCopyToast(false);
      }, 2000);
    }
  };

  // Function to count code blocks in a message
  const countCodeBlocks = useCallback((content: string): number => {
    return extractAllCodeBlocks(content).length;
  }, []);

  // Function to extract and display code blocks with copy buttons
  const renderCodeBlocks = useCallback((content: string) => {
    const codeBlocks = extractAllCodeBlocks(content);
    if (codeBlocks.length === 0) return null;
    
    return (
      <View style={{ marginVertical: 8 }}>
        {codeBlocks.map((code, index) => (
          <View key={`code-${index}`} style={styles.codeBlock}>
            <Text 
              selectable={true}
              style={styles.codeText}
            >
              {code}
            </Text>
            <TouchableOpacity 
              style={styles.codeBlockCopyButton}
              onPress={() => {
                copyToClipboard(code);
                copyToastMessageRef.current = 'Code copied to clipboard';
              }}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons 
                name="copy-outline" 
                size={14} 
                color={themeColors.headerText} 
              />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  }, [copyToClipboard]);

  const handleRegenerate = async () => {
    if (messages.length < 2) return;
    
    // Check if a model is selected
    if (!llamaManager.getModelPath()) {
      Alert.alert('No Model Selected', 'Please select a model first to regenerate a response.');
      return;
    }
    
    // Get the last user message
    const lastUserMessageIndex = [...messages].reverse().findIndex(msg => msg.role === 'user');
    if (lastUserMessageIndex === -1) return;
    
    const lastUserMessage = messages[messages.length - lastUserMessageIndex - 1];
    
    // Remove the last assistant message
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
    
    // Set up streaming state
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
      await llamaManager.generateResponse(
        [...newMessages].map(msg => ({ role: msg.role, content: msg.content })),
        (token) => {
          if (cancelGenerationRef.current) {
            return false;  // Return false to stop generation
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
            
            // Update the streaming message immediately to show real-time formatting
            setStreamingMessage(fullResponse);
          }
          
          // Update streaming stats in real-time
          setStreamingStats({
            tokens: tokenCount,
            duration: (Date.now() - startTime) / 1000
          });
          
          // Update message content in real-time (this will now save to AsyncStorage)
          if (tokenCount % 10 === 0) { // Update every 10 tokens to reduce overhead
            const finalMessage: Message = {
              ...assistantMessage,
              content: fullResponse,
              thinking: thinking.trim(),
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
      
      // Only update if not cancelled
      if (!cancelGenerationRef.current) {
        const finalMessage: Message = {
          ...assistantMessage,
          content: fullResponse,
          thinking: thinking.trim(),
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

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const messageContent = (isStreaming && item.id === streamingMessageId) 
      ? streamingMessage 
      : item.content;
      
    const thinkingContent = (isStreaming && item.id === streamingMessageId)
      ? streamingThinking
      : item.thinking;

    const stats = (isStreaming && item.id === streamingMessageId)
      ? streamingStats
      : item.stats;
      
    return (
      <View style={styles.messageContainer}>
        {item.role === 'assistant' && thinkingContent && (
          <View key="thinking" style={styles.thinkingContainer}>
            <View style={styles.thinkingHeader}>
              <Ionicons 
                name="bulb-outline" 
                size={14} 
                color={themeColors.secondaryText}
                style={styles.thinkingIcon}
              />
              <Text style={[styles.thinkingLabel, { color: themeColors.secondaryText }]}>
                Reasoning
              </Text>
              <TouchableOpacity 
                style={styles.copyButton} 
                onPress={() => copyToClipboard(thinkingContent)}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <Ionicons 
                  name="copy-outline" 
                  size={14} 
                  color={themeColors.secondaryText} 
                />
              </TouchableOpacity>
            </View>
            <Text 
              style={[styles.thinkingText, { color: themeColors.secondaryText }]} 
              selectable={true}
            >
              {thinkingContent}
            </Text>
          </View>
        )}
        <View style={[
          styles.messageCard,
          { 
            backgroundColor: item.role === 'user' ? themeColors.headerBackground : themeColors.borderColor,
            alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
            borderTopRightRadius: item.role === 'user' ? 4 : 20,
            borderTopLeftRadius: item.role === 'user' ? 20 : 4,
          }
        ]}>
          <View style={styles.messageHeader}>
            <Text style={[styles.roleLabel, { color: item.role === 'user' ? '#fff' : themeColors.text }]}>
              {item.role === 'user' ? 'You' : 'Model'}
            </Text>
            <TouchableOpacity 
              style={styles.copyButton} 
              onPress={() => copyToClipboard(item.content)}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons 
                name="copy-outline" 
                size={16} 
                color={item.role === 'user' ? '#fff' : themeColors.text} 
              />
            </TouchableOpacity>
          </View>

          {!hasMarkdownFormatting(messageContent) ? (
            <View style={styles.messageContent}>
              <Text 
                style={[
                  styles.messageText,
                  { color: item.role === 'user' ? '#fff' : themeColors.text }
                ]}
                selectable={true}
              >
                {messageContent}
              </Text>
            </View>
          ) : (
            <View style={styles.markdownWrapper}>
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
                  code_block: {
                    backgroundColor: '#000',
                    borderRadius: 8,
                    padding: 12,
                    marginVertical: 8,
                    position: 'relative',
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  },
                  fence: {
                    backgroundColor: '#000',
                    borderRadius: 8,
                    padding: 12,
                    marginVertical: 8,
                    position: 'relative',
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  },
                  code_inline: {
                    color: '#fff',
                    backgroundColor: '#000',
                    borderRadius: 4,
                    paddingHorizontal: 4,
                    paddingVertical: 2,
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                    fontSize: 14,
                  },
                  text: {
                    color: item.role === 'user' ? '#fff' : themeColors.text,
                  },
                  fence_text: {
                    color: '#fff',
                  },
                  code_block_text: {
                    color: '#fff',
                  }
                }}
                rules={{
                  fence: (node, children, parent, styles) => {
                    const codeContent = node.content;
                    return (
                      <View style={[styles.fence, { position: 'relative' }]} key={node.key}>
                        <Text style={styles.fence_text} selectable={true}>
                          {codeContent}
                        </Text>
                        <TouchableOpacity 
                          style={styles.codeBlockCopyButton}
                          onPress={() => {
                            copyToClipboard(codeContent);
                            copyToastMessageRef.current = 'Code copied to clipboard';
                          }}
                          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                        >
                          <Ionicons 
                            name="copy-outline" 
                            size={14} 
                            color={themeColors.headerText} 
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  },
                  code_block: (node, children, parent, styles) => {
                    const codeContent = node.content;
                    return (
                      <View style={[styles.code_block, { position: 'relative' }]} key={node.key}>
                        <Text style={styles.code_block_text} selectable={true}>
                          {codeContent}
                        </Text>
                        <TouchableOpacity 
                          style={styles.codeBlockCopyButton}
                          onPress={() => {
                            copyToClipboard(codeContent);
                            copyToastMessageRef.current = 'Code copied to clipboard';
                          }}
                          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                        >
                          <Ionicons 
                            name="copy-outline" 
                            size={14} 
                            color={themeColors.headerText} 
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  }
                }}
              >
                {messageContent}
              </Markdown>
            </View>
          )}

          {item.role === 'assistant' && stats && (
            <View style={styles.statsContainer}>
              <Text style={[styles.statsText, { color: themeColors.secondaryText }]}>
                {`${stats.tokens.toLocaleString()} tokens`}
              </Text>
              
              {item === messages[messages.length - 1] && (
                <TouchableOpacity 
                  style={[
                    styles.regenerateButton,
                    isRegenerating && styles.regenerateButtonDisabled
                  ]}
                  onPress={handleRegenerate}
                  disabled={isLoading || isRegenerating}
                >
                  {isRegenerating ? (
                    <ActivityIndicator size="small" color={themeColors.secondaryText} />
                  ) : (
                    <>
                      <Ionicons 
                        name="refresh-outline" 
                        size={14} 
                        color={themeColors.secondaryText}
                      />
                      <Text style={[styles.regenerateButtonText, { color: themeColors.secondaryText }]}>
                        Regenerate
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    );
  }, [themeColors, messages, isLoading, isRegenerating, handleRegenerate, copyToClipboard, isStreaming, streamingMessageId, streamingMessage, streamingThinking, streamingStats]);

  const startNewChat = async () => {
    try {
      // Before creating a new chat, save the current chat if it has messages
      if (chat && messages.some(msg => msg.role === 'user' || msg.role === 'assistant')) {
        await chatManager.saveAllChats();
      }
      
      // Create a new chat and set it as current
      const newChat = await chatManager.createNewChat();
      setChat(newChat);
      setMessages(newChat.messages);
      
      // Reset any streaming or loading states
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
      // Set the current chat in the chat manager
      const success = await chatManager.setCurrentChat(chatId);
      
      if (success) {
        // Get the updated current chat
        const currentChat = chatManager.getCurrentChat();
        
        // Update the UI state
        if (currentChat) {
          setChat(currentChat);
          setMessages(currentChat.messages);
          
          // Reset streaming states
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
      
      {/* iOS Copy Toast */}
      {showCopyToast && (
        <View style={styles.copyToast}>
          <Text style={styles.copyToastText}>{copyToastMessageRef.current}</Text>
        </View>
      )}

      {/* Memory Warning Modal */}
      <Modal
        visible={showMemoryWarning}
        transparent
        animationType="fade"
        onRequestClose={handleMemoryWarningClose}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.borderColor }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="warning-outline" size={32} color={getThemeAwareColor('#FFA726', currentTheme)} />
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
              Although, you can still continue using this app, but optimal performance, consider using a phone with more RAM.
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

      <View style={{ flex: 1, width: '100%' }}>
        <View style={styles.modelSelectorWrapper}>
          <ModelSelector 
            ref={modelSelectorRef}
            isOpen={shouldOpenModelSelector}
            onClose={() => setShouldOpenModelSelector(false)}
            preselectedModelPath={preselectedModelPath}
            isGenerating={isLoading || isRegenerating}
          />
        </View>

        <View style={[styles.messagesContainer]}>
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons 
                name="chatbubble-ellipses-outline" 
                size={48} 
                color={currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.75)'} 
              />
              <Text style={[{ color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.75)' }]}>
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
                autoscrollToTopThreshold: 10,
              }}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={() => Keyboard.dismiss()}
              keyboardDismissMode="on-drag"
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={true}
              initialNumToRender={15}
              removeClippedSubviews={false}
              windowSize={10}
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={50}
              onEndReachedThreshold={0.5}
              scrollIndicatorInsets={{ right: 1 }}
            />
          )}
        </View>
      </View>

      <View style={{
        width: '100%',
        backgroundColor: themeColors.background,
        borderTopWidth: 1,
        borderTopColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      }}>
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
    </SafeAreaView>
  );
}

const inpStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    width: '100%',
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 24,
    marginRight: 8,
    paddingHorizontal: 16,
    minHeight: 48,
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  input: {
    fontSize: 16,
    color: '#000',
    paddingVertical: 4,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginRight: 8,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  loadingIndicator: {
    marginRight: 12,
  },
  cancelButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#d32f2f',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    width: '100%',
  },
  chatContainer: {
    flex: 1,
    marginTop: 8,
  },
  messageList: {
    flexGrow: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    paddingBottom: 80,
  },
  messagesContainer: {
    flex: 1,
    width: '100%',
  },
  inputContainer: {
    backgroundColor: 'transparent',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
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
  modelSelectorWrapper: {
    marginBottom: 2,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 15,
    marginHorizontal: 16,
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
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    minHeight: 40,
  },
  inputContainerDisabled: {
    opacity: 0.7,
  },
  codeBlockContainer: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    marginVertical: 4,
    position: 'relative',
    color: '#fff',
  },
  codeText: {
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
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
  activeButton: {
    backgroundColor: '#4a0660',
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
  codeBlock: {
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 12,
    marginVertical: 4,
    position: 'relative',
    minHeight: 40,
  },
  loadingButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingIndicator: {
    marginRight: 10,
  },
  cancelButton: {
    backgroundColor: '#d32f2f',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
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
}); 