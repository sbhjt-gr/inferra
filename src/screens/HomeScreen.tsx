import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Platform,
  TouchableOpacity,
  Keyboard,
  AppState,
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Clipboard,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ModelSelectorRef } from '../components/ModelSelector';
import { llamaManager } from '../utils/LlamaManager';
import AppHeader from '../components/AppHeader';
import { useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import chatManager, { Chat, ChatMessage } from '../utils/ChatManager';
import ChatView from '../components/chat/ChatView';
import ChatInput from '../components/chat/ChatInput';
import { onlineModelService } from '../services/OnlineModelService';
import { useModel } from '../context/ModelContext';
import { Dialog, Portal, Button, Text as PaperText } from 'react-native-paper';
import { useRemoteModel } from '../context/RemoteModelContext';

import { debounce, generateRandomId } from '../utils/homeScreenUtils';
import { useDialog } from '../hooks/useDialog';
import { useCopyToast } from '../hooks/useCopyToast';
import { useKeyboard } from '../hooks/useKeyboard';
import { useMemoryWarning } from '../hooks/useMemoryWarning';
import { useChatManagement } from '../hooks/useChatManagement';
import { useMessageEditing } from '../hooks/useMessageEditing';
import { useStreamingState } from '../hooks/useStreamingState';
import { useHomeScreenSettings } from '../hooks/useHomeScreenSettings';
import CopyToast from '../components/CopyToast';
import MemoryWarningDialog from '../components/MemoryWarningDialog';
import ModelSelectorComponent from '../components/chat/ModelSelectorComponent';
import { MessageProcessingService } from '../services/MessageProcessingService';
import { RegenerationService } from '../services/RegenerationService';
import { ModelManagementService } from '../services/ModelManagementService';
import { ChatLifecycleService } from '../services/ChatLifecycleService';
import { homeScreenStyles } from './homeScreenStyles';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  route: RouteProp<TabParamList, 'HomeTab'>;
};

export default function HomeScreen({ route, navigation }: HomeScreenProps) {
  const { theme: currentTheme, selectedTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const { isWideScreen } = useResponsiveLayout();
  const [chat, setChat] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const modelSelectorRef = useRef<ModelSelectorRef>(null);
  const [shouldOpenModelSelector, setShouldOpenModelSelector] = useState(false);
  const [preselectedModelPath, setPreselectedModelPath] = useState<string | null>(null);
  const [onlineModelProvider, setOnlineModelProvider] = useState<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const isFirstLaunchRef = useRef(true);
  const [activeProvider, setActiveProvider] = useState<'local' | 'apple' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude' | null>(null);
  const { loadModel, unloadModel, setSelectedModelPath, isModelLoading, selectedModelPath } = useModel();
  const flatListRef = useRef<FlatList>(null);

  const [isCooldown, setIsCooldown] = useState(false);
  const [justCancelled, setJustCancelled] = useState(false);

  const { dialogVisible, dialogTitle, dialogMessage, dialogActions, showDialog, hideDialog } = useDialog();
  const { showCopyToast, copyToastMessage, showToast } = useCopyToast();
  const { showMemoryWarning, memoryWarningType, checkSystemMemory, handleMemoryWarningClose } = useMemoryWarning();
  
  const {
    messages,
    setMessages,
    loadChat,
    saveMessages,
    saveMessagesImmediate,
    saveMessagesDebounced,
  } = useChatManagement();

  const processMessageRef = useRef<(() => Promise<void>) | null>(null);

  const {
    isEditingMessage,
    editingMessageText,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
  } = useMessageEditing(messages, async () => {
    if (processMessageRef.current) {
      await processMessageRef.current();
    }
  });

  const {
    isStreaming,
    setIsStreaming,
    streamingMessage,
    setStreamingMessage,
    streamingThinking,
    setStreamingThinking,
    streamingMessageId,
    setStreamingMessageId,
    streamingStats,
    setStreamingStats,
    isRegenerating,
    setIsRegenerating,
    cancelGenerationRef,
    resetStreamingState,
  } = useStreamingState();

  const { enableRemoteModels, isLoggedIn } = useRemoteModel();
  const { getEffectiveSettings } = useHomeScreenSettings(
    activeProvider,
    enableRemoteModels,
    isLoggedIn,
    navigation,
    showDialog,
    hideDialog
  );

  const updateMessageContentDebounced = useRef(debounce((
    messageId: string, 
    content: string, 
    thinking: string, 
    stats: { duration: number; tokens: number; firstTokenTime?: number; avgTokenTime?: number }
  ) => {
    chatManager.updateMessageContent(
      messageId,
      content,
      thinking,
      stats
    );
  }, 300)).current;

  const messageProcessingService = useMemo(() => 
    new MessageProcessingService(cancelGenerationRef, {
      setMessages, setStreamingMessageId, setStreamingMessage, setStreamingThinking, 
      setStreamingStats, setIsStreaming, setIsRegenerating, updateMessageContentDebounced,
      saveMessagesImmediate, saveMessages, saveMessagesDebounced, handleApiError
    }), [cancelGenerationRef, setMessages, setStreamingMessageId, setStreamingMessage, 
         setStreamingThinking, setStreamingStats, setIsStreaming, setIsRegenerating, 
         saveMessagesImmediate, saveMessages, saveMessagesDebounced, updateMessageContentDebounced]);

  const regenerationService = useMemo(() => 
    new RegenerationService(cancelGenerationRef, {
      setMessages, setStreamingMessageId, setStreamingMessage, setStreamingThinking,
      setStreamingStats, setIsStreaming, setIsRegenerating,
      saveMessagesImmediate, saveMessages, saveMessagesDebounced, handleApiError
    }), [cancelGenerationRef, setMessages, setStreamingMessageId, setStreamingMessage,
         setStreamingThinking, setStreamingStats, setIsStreaming, setIsRegenerating,
         saveMessagesImmediate, saveMessages, saveMessagesDebounced]);

  useFocusEffect(
    useCallback(() => {
      modelSelectorRef.current?.refreshModels();
      ChatLifecycleService.initializeSessionAndReview();
    }, [])
  );

  useEffect(() => {
    const initializeChat = async () => {
      if (isFirstLaunchRef.current) {
        await startNewChat();
        isFirstLaunchRef.current = false;
        return;
      }

      const currentChat = chatManager.getCurrentChat();
      if (currentChat) {
        setChat(currentChat);
        setMessages(currentChat.messages || []);
      } else {
        await startNewChat();
      }
    };

    initializeChat();

    const unsubscribe = chatManager.addListener(() => {
      const currentChat = chatManager.getCurrentChat();
      if (currentChat) {
        setChat(currentChat);
        setMessages(currentChat.messages || []);
      }
    });

    return () => {
      unsubscribe();
      saveMessagesDebounced.cancel();
      updateMessageContentDebounced.cancel();
    };
  }, []);

  useEffect(() => {
    if (route.params?.modelPath) {
      setShouldOpenModelSelector(true);
      setPreselectedModelPath(route.params.modelPath);
    }

    checkSystemMemory();
  }, [route.params?.modelPath, checkSystemMemory]);

  useEffect(() => {
    const handleLoadChat = async () => {
      const loadChatId = route.params?.loadChatId || (route.params as any)?.params?.loadChatId;

      if (loadChatId) {
        await chatManager.ensureInitialized();
        const specificChat = chatManager.getChatById(loadChatId);
        if (specificChat) {
          setChat(specificChat);
          setMessages(specificChat.messages || []);
          await chatManager.setCurrentChat(loadChatId);
        }
        navigation.setParams({ loadChatId: undefined });
      }
    };

    handleLoadChat();
  }, [route.params?.loadChatId, (route.params as any)?.params?.loadChatId, navigation]);

  useFocusEffect(
    useCallback(() => {
      ChatLifecycleService.recheckApiKeys(
        activeProvider,
        enableRemoteModels,
        isLoggedIn,
        onlineModelService,
        setActiveProvider
      );
      
      return () => {
        Keyboard.dismiss();
      };
    }, [activeProvider, enableRemoteModels, isLoggedIn])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', 
      ChatLifecycleService.setupAppStateListener(
        () => ChatLifecycleService.loadCurrentChat({ setChat, setMessages }),
        isRegenerating || false,
        isStreaming || false,
        isLoading || false
      )
    );

    return () => {
      subscription?.remove();
    };
  }, [isRegenerating, isStreaming, isLoading]);

  const handleSend = async (text: string) => {
    const messageText = text.trim();
    if (!messageText) return;
    
    if (!llamaManager.getModelPath() && !activeProvider) {
      setShouldOpenModelSelector(true);
      return;
    }

    try {
      await stopGenerationIfRunning();
      
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
    const currentStats = streamingStats || { tokens: 0, duration: 0 };
    
    setIsLoading(false);
    setIsRegenerating(false);
    
    if (currentMessageId) {
      const updatedMessages = messages.map(msg => {
        if (msg.id === currentMessageId) {
          return {
            ...msg,
            content: currentContent,
            thinking: currentThinking,
            stats: currentStats
          };
        }
        return msg;
      });
      
      setMessages(updatedMessages);
      saveMessagesDebounced.cancel();
      await saveMessagesImmediate(updatedMessages);
    }
    
    if (activeProvider === 'local') {
      try {
        await llamaManager.stopCompletion();
      } catch (error) {
        try {
          await llamaManager.cancelGeneration();
        } catch (fallbackError) {
        }
      }
    } else {
    }
    
    if (currentMessageId && (currentContent || currentThinking)) {
      const currentChat = chatManager.getCurrentChat();
      if (currentChat) {
        try {
          await chatManager.updateMessageContent(
            currentMessageId,
            currentContent,
            currentThinking,
            currentStats
          );
        } catch (error) {
        }
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
  }, [streamingMessage, streamingThinking, streamingMessageId, streamingStats, activeProvider, messages]);

  const stopGenerationIfRunning = useCallback(async () => {
    
    if (isLoading || isRegenerating || isStreaming) {
      
      cancelGenerationRef.current = true;
      
      if (activeProvider === 'local') {
        try {
          await llamaManager.stopCompletion();
        } catch (error) {
        }
      } else {
      }
      
      setIsLoading(false);
      setIsRegenerating(false);
      setIsStreaming(false);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } else {
    }
  }, [isLoading, isRegenerating, isStreaming, activeProvider]);

  const handleApiError = (error: unknown, provider: 'Gemini' | 'OpenAI' | 'DeepSeek' | 'Claude' | 'Apple') => {

    if (provider === 'Apple') {
      showDialog(
        'Apple Intelligence Error',
        'Apple Intelligence encountered an issue. Please verify your device supports Apple Intelligence and try again.',
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
      return;
    }
    
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
      await stopGenerationIfRunning();
      const settings = await getEffectiveSettings();
      
      await messageProcessingService.processMessage(
        activeProvider,
        settings
      );
    } catch (error) {
      showDialog(
        'Error',
        'Failed to generate response',
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
      resetStreamingState();
    }
  };

  processMessageRef.current = processMessage;

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    showToast('Copied to clipboard');
  };

  const handleEditingStateChange = useCallback((isEditing: boolean) => {
  }, []);

  const handleRegenerate = async () => {
    if (messages.length < 2) return;
    
    try {
      await stopGenerationIfRunning();
      const settings = await getEffectiveSettings();
      
      await regenerationService.handleRegenerate(
        messages,
        activeProvider,
        settings
      );
    } catch (error) {
      if (error instanceof Error) {
        showDialog(
          'Error',
          error.message === 'No valid model selected' 
            ? 'Please select a model first to regenerate a response.'
            : 'Failed to regenerate response',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
      }
    } finally {
      resetStreamingState();
    }
  };

  const startNewChat = async () => {
    try {
      await ChatLifecycleService.startNewChat({ setChat, setMessages });
    } catch (error) {
      showDialog(
        'Error',
        'Failed to create new chat',
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
    }
  };

  const handleModelSelect = async (model: 'local' | 'apple' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude', modelPath?: string, projectorPath?: string) => {
    await ModelManagementService.handleModelSelect(
      {
        model,
        modelPath,
        projectorPath,
        isLoading: isLoading || false,
        isRegenerating: isRegenerating || false,
        enableRemoteModels,
        isLoggedIn,
        loadModel,
        unloadModel
      },
      (provider) => setActiveProvider(provider),
      setSelectedModelPath,
      showDialog,
      hideDialog,
      navigation
    );
  };

  useEffect(() => {
    const cleanup = ModelManagementService.setupModelChangeListeners(
      activeProvider,
      (provider) => setActiveProvider(provider)
    );
    return cleanup;
  }, [activeProvider]);



  if (!chat) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
        <Text style={{marginTop: 10, color: themeColors.text}}>Loading Chat...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['left', 'right']}>
      <AppHeader 
        onNewChat={startNewChat}
        showLogo={!isWideScreen}
        title={isWideScreen ? '' : 'Inferra'}
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
         <ModelSelectorComponent
            modelSelectorRef={modelSelectorRef}
            shouldOpenModelSelector={shouldOpenModelSelector}
            onClose={() => setShouldOpenModelSelector(false)}
            activeProvider={activeProvider}
            isLoading={isLoading || false}
            isRegenerating={isRegenerating || false}
            onModelSelect={handleModelSelect}
            style={styles.modelSelectorWrapper}
          />
      </View>
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
           onStopGeneration={stopGenerationIfRunning}
           onEditingStateChange={handleEditingStateChange}
           onStartEdit={handleStartEdit}
        />

        <ChatInput
          onSend={handleSend}
          disabled={isLoading || isModelLoading || isCooldown}
          isLoading={isLoading}
          isRegenerating={isRegenerating}
          onCancel={handleCancelGeneration}
          onStop={handleCancelGeneration}
          style={{ backgroundColor: themeColors.background, borderTopColor: themeColors.borderColor }}
          placeholderColor={themeColors.secondaryText}
          isEditing={isEditingMessage}
          editingText={editingMessageText}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
        />
      </KeyboardAvoidingView>

      <CopyToast visible={showCopyToast} message={copyToastMessage} />
      
      <MemoryWarningDialog 
        visible={showMemoryWarning}
        memoryWarningType={memoryWarningType}
        onClose={handleMemoryWarningClose}
      />

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

const styles = homeScreenStyles; 