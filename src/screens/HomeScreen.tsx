import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Platform,
  TouchableOpacity,
  Keyboard,
  AppState,
  View,
  Text,
  FlatList,
  Clipboard,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { GradientBg } from '../services/adapters/GradientBgAdapter';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ModelSelectorRef } from '../components/ModelSelector';
import { llamaManager } from '../utils/LlamaManager';
import AppHeader from '../components/AppHeader';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import chatManager, { Chat, ChatMessage } from '../utils/ChatManager';
import ChatView from '../components/chat/ChatView';
import ChatInput from '../components/chat/ChatInput';
import { onlineModelService, OnlineModelService } from '../services/OnlineModelService';
import { useModel } from '../context/ModelContext';

import Dialog from '../components/Dialog';
import { useRemoteModel } from '../context/RemoteModelContext';
import { engineService } from '../services/runtime-service';

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
import type { ProviderType } from '../services/ModelManagementService';
import { ChatLifecycleService } from '../services/ChatLifecycleService';
import { appleFoundationService } from '../services/AppleFoundationService';
import { skillManager } from '../services/SkillManager';
import { skillActivityAdapter } from '../services/adapters/SkillActivityAdapter';
import type { SkillActivityStep } from '../types/skillActivity';
import { homeScreenStyles as styles } from './homeScreenStyles';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { isLiquidGlassAvailable } from '../services/adapters/GlassEffectAdapter';

const FLOAT_TAB = 62;

let hasInitializedChat = false;

const remoteProviders: ProviderType[] = ['gemini', 'chatgpt', 'claude'];

const isRemoteProvider = (provider: string | null): boolean => {
  if (!provider) {
    return false;
  }
  const baseProvider = OnlineModelService.getBaseProvider(provider);
  return remoteProviders.includes(baseProvider as ProviderType);
};

export default function HomeScreen() {
  const { theme: currentTheme, selectedTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const { useIosHeader } = useResponsiveLayout();
  const router = useRouter();
  const params = useLocalSearchParams<{ loadChatId?: string; modelPath?: string }>();
  const [chat, setChat] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const modelSelectorRef = useRef<ModelSelectorRef>(null);
  const [shouldOpenModelSelector, setShouldOpenModelSelector] = useState(false);
  const closeModelSelector = useCallback(() => setShouldOpenModelSelector(false), []);
  const [preselectedModelPath, setPreselectedModelPath] = useState<string | null>(null);
  const [onlineModelProvider, setOnlineModelProvider] = useState<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const isFirstLaunchRef = useRef(true);
  const [activeProvider, setActiveProvider] = useState<ProviderType | null>(null);
  const { loadModel, unloadModel, setSelectedModelPath, isModelLoading, selectedModelPath } = useModel();
  const flatListRef = useRef<FlatList>(null);

  const [isCooldown, setIsCooldown] = useState(false);
  const [justCancelled, setJustCancelled] = useState(false);
  const [skillSteps, setSkillSteps] = useState<SkillActivityStep[]>([]);

  const { dialogVisible, dialogTitle, dialogMessage, dialogPrimaryText, dialogPrimaryPress, dialogSecondaryText, dialogSecondaryPress, showDialog, hideDialog } = useDialog();
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
         saveMessagesImmediate, saveMessages, saveMessagesDebounced, updateMessageContentDebounced, handleApiError]);

  const regenerationService = useMemo(() => 
    new RegenerationService(cancelGenerationRef, {
      setMessages, setStreamingMessageId, setStreamingMessage, setStreamingThinking,
      setStreamingStats, setIsStreaming, setIsRegenerating,
      saveMessagesImmediate, saveMessages, saveMessagesDebounced, handleApiError
    }), [cancelGenerationRef, setMessages, setStreamingMessageId, setStreamingMessage,
         setStreamingThinking, setStreamingStats, setIsStreaming, setIsRegenerating,
         saveMessagesImmediate, saveMessages, saveMessagesDebounced, handleApiError]);

  useFocusEffect(
    useCallback(() => {
      modelSelectorRef.current?.refreshModels();
      ChatLifecycleService.initializeSessionAndReview();
    }, [])
  );

  useEffect(() => {
    return skillActivityAdapter.subscribe(setSkillSteps);
  }, []);

  const loadChatIdRef = useRef<string | null>(null);
  const isLoadingChatRef = useRef(false);

  useEffect(() => {
    const initializeChat = async () => {
      const pendingLoadChatId = params.loadChatId;
      if (pendingLoadChatId) {
        loadChatIdRef.current = pendingLoadChatId;
        isFirstLaunchRef.current = false;
        return;
      }

      if (isFirstLaunchRef.current) {
        isFirstLaunchRef.current = false;
        if (hasInitializedChat) {
          const existingChat = chatManager.getCurrentChat();
          if (existingChat) {
            setChat(existingChat);
            setMessages(existingChat.messages || []);
            return;
          }
        }
        hasInitializedChat = true;
        await startNewChat();
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
      if (isLoadingChatRef.current || chatManager.isCurrentlyLoadingChat()) {
        return;
      }
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
    if (params.modelPath) {
      setShouldOpenModelSelector(true);
      setPreselectedModelPath(params.modelPath);
    }

    checkSystemMemory();
  }, [params.modelPath, checkSystemMemory]);

  useEffect(() => {
    if (activeProvider) return;

    if (selectedModelPath === 'apple-foundation') {
      setActiveProvider('apple-foundation');
      chatManager.setCurrentProvider('apple-foundation');
      return;
    }

    if (isRemoteProvider(selectedModelPath)) {
      if (!enableRemoteModels || !isLoggedIn) return;
      setActiveProvider(selectedModelPath as ProviderType);
      chatManager.setCurrentProvider(selectedModelPath as ProviderType);
      return;
    }

    const modelPath = engineService.getActiveModelPath();
    if (modelPath) {
      setActiveProvider('local');
      chatManager.setCurrentProvider('local');
    }
  }, [activeProvider, selectedModelPath, enableRemoteModels, isLoggedIn]);

  useEffect(() => {
    const handleLoadChat = async () => {
      const loadChatId = params.loadChatId;

      if (loadChatId) {
        isLoadingChatRef.current = true;
        isFirstLaunchRef.current = false;
        
        try {
          await chatManager.ensureInitialized();
          await chatManager.setCurrentChat(loadChatId, true);
          
          const specificChat = chatManager.getChatById(loadChatId);
          if (specificChat) {
            setChat(specificChat);
            setMessages([...specificChat.messages]);
          }
        } finally {
          isLoadingChatRef.current = false;
          loadChatIdRef.current = null;
          router.setParams({ loadChatId: undefined });
        }
      }
    };

    handleLoadChat();
  }, [params.loadChatId, router]);

  useFocusEffect(
    useCallback(() => {
      ChatLifecycleService.recheckApiKeys(
        activeProvider,
        enableRemoteModels,
        isLoggedIn,
        onlineModelService,
        (provider) => setActiveProvider(provider)
      );
      
      return () => {
        Keyboard.dismiss();
      };
    }, [activeProvider, enableRemoteModels, isLoggedIn])
  );

  const isRegeneratingRef = useRef(isRegenerating);
  const isStreamingRef = useRef(isStreaming);
  const isLoadingRef = useRef(isLoading);
  
  useEffect(() => {
    isRegeneratingRef.current = isRegenerating;
    isStreamingRef.current = isStreaming;
    isLoadingRef.current = isLoading;
  }, [isRegenerating, isStreaming, isLoading]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        if (!isRegeneratingRef.current && !isStreamingRef.current && !isLoadingRef.current && !isLoadingChatRef.current) {
          ChatLifecycleService.loadCurrentChat({ setChat, setMessages });
        }
      }
    };
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, []);

  const handleSend = async (text: string) => {
    const messageText = text.trim();
    if (!messageText) {
      return;
    }

    const providerFromSelection = selectedModelPath === 'apple-foundation'
      ? 'apple-foundation'
      : isRemoteProvider(selectedModelPath)
        ? (selectedModelPath as ProviderType)
        : null;
    const effectiveProvider = activeProvider || providerFromSelection;
    if (!activeProvider && providerFromSelection) {
      setActiveProvider(providerFromSelection);
      chatManager.setCurrentProvider(providerFromSelection);
    }
    
    if (!engineService.getActiveModelPath() && !effectiveProvider) {
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
        );
        return;
      }

      const updatedChat = chatManager.getCurrentChat();
      if (updatedChat) {
        setMessages([...updatedChat.messages]);
      }
      
      await processMessage(effectiveProvider);
    } catch (error) {
      showDialog(
        'Error',
        'Failed to send message',
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
      const snapSteps = skillActivityAdapter.snapshot();
      const updatedMessages = messages.map(msg => {
        if (msg.id === currentMessageId) {
          return {
            ...msg,
            content: currentContent,
            thinking: currentThinking,
            stats: currentStats,
            skillSteps: snapSteps.length > 0 ? snapSteps : msg.skillSteps,
          };
        }
        return msg;
      });
      
      setMessages(updatedMessages);
      saveMessagesDebounced.cancel();
      await saveMessagesImmediate(updatedMessages);
      skillActivityAdapter.clear();
    }
    
    if (activeProvider === 'local') {
      engineService.stop();
      try {
        await llamaManager.stopCompletion();
      } catch (error) {
        try {
          await llamaManager.cancelGeneration();
        } catch (fallbackError) {
        }
      }
    } else if (activeProvider === 'apple-foundation') {
      appleFoundationService.cancel();
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
        engineService.stop();
        try {
          await llamaManager.stopCompletion();
        } catch (error) {
        }
      } else if (activeProvider === 'apple-foundation') {
        appleFoundationService.cancel();
      } else {
      }
      
      setIsLoading(false);
      setIsRegenerating(false);
      setIsStreaming(false);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } else {
    }
  }, [isLoading, isRegenerating, isStreaming, activeProvider]);

  const handleApiError = (error: unknown, provider: 'Gemini' | 'OpenAI' | 'Claude') => {
    
    if (error instanceof Error) {
      if (error.message.startsWith('QUOTA_EXCEEDED:')) {
        showDialog(
          `${provider} API Quota Exceeded`,
          `Your ${provider} API quota has been exceeded. Please try again later or upgrade your API plan.`,
          { label: 'Go to Settings', onPress: () => { hideDialog(); router.push('/(tabs)/settings'); } },
          { label: 'OK', onPress: hideDialog }
        );
        return;
      }
      
      if (error.message.startsWith('AUTHENTICATION_ERROR:')) {
        showDialog(
          `${provider} API Authentication Error`,
          `Your ${provider} API key appears to be invalid. Please check your API key in Settings.`,
          { label: 'Go to Settings', onPress: () => { hideDialog(); router.push('/(tabs)/settings'); } },
          { label: 'OK', onPress: hideDialog }
        );
        return;
      }
      
      if (error.message.startsWith('CONTENT_FILTERED:')) {
        showDialog(
          'Content Policy Violation',
          'Your request was blocked due to content policy violations. Please modify your message and try again.',
        );
        return;
      }
      
      if (error.message.startsWith('CONTEXT_LENGTH_EXCEEDED:')) {
        showDialog(
          'Message Too Long',
          'Your message is too long for the model\'s context window. Please shorten your input or start a new chat.',
        );
        return;
      }
      
      if (error.message.startsWith('SERVER_ERROR:')) {
        showDialog(
          `${provider} Server Error`,
          `The ${provider} API is currently experiencing issues. Please try again later.`,
        );
        return;
      }
      
      if (error.message.startsWith('INVALID_REQUEST:')) {
        showDialog(
          'Invalid Request',
          `The request to the ${provider} API was invalid. Please try again with different input.`,
        );
        return;
      }
      
      if (error.message.startsWith('PERMISSION_DENIED:')) {
        showDialog(
          'Permission Denied',
          `You don't have permission to access this ${provider} model or feature.`,
        );
        return;
      }
      
      if (error.message.startsWith('NOT_FOUND:')) {
        showDialog(
          'Model Not Found',
          `The requested ${provider} model was not found. It may be deprecated or unavailable.`,
        );
        return;
      }
      
      showDialog(
        `${provider} API Error`,
        error.message,
      );
    } else {
      showDialog(
        `${provider} API Error`,
        'Unknown error occurred',
      );
    }
  };

  const processMessage = async (providerOverride?: ProviderType | null) => {
    const provider = providerOverride ?? activeProvider;
    const currentChat = chatManager.getCurrentChat();
    if (!currentChat) return;

    try {
      await stopGenerationIfRunning();
      let settings = providerOverride
        ? await ChatLifecycleService.getEffectiveSettings(providerOverride)
        : await getEffectiveSettings();

      await skillManager.syncTools();

      let basePrompt = settings.systemPrompt;
      const isOnlineModel = !!provider
        && ['gemini', 'chatgpt', 'claude'].includes(OnlineModelService.getBaseProvider(provider));
      if (isOnlineModel && provider) {
        const providerInstruction = await onlineModelService.getSystemInstruction(provider);
        if (providerInstruction?.trim()) {
          basePrompt = providerInstruction.trim();
        }
      }

      settings = {
        ...settings,
        systemPrompt: await skillManager.buildSystemPrompt(basePrompt),
      };

      await messageProcessingService.processMessage(
        provider,
        settings
      );
    } catch (error) {
      console.log('local_process_message_error', error instanceof Error ? error.message : 'unknown');
      resetStreamingState();
      const msg = error instanceof Error ? error.message : '';
      setTimeout(() => {
        if (msg === 'CONTEXT_LENGTH_EXCEEDED') {
          showDialog(
            'Message Too Long',
            'Your message is too long for the model\'s context window. Please increase the context window limit.',
          );
        } else if (msg === 'VISION_EVAL_FAILED') {
          showDialog(
            'Vision Failed',
            'Could not process the image with this model. Try a smaller image, OCR mode, or reload the projector.',
          );
        } else {
          showDialog(
            'Error',
            'Failed to generate response. Model might not be supported.',
          );
        }
      }, 100);
    }
  };

  processMessageRef.current = processMessage;

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    showToast('Copied to clipboard');
  };

  const handleEditingStateChange = useCallback((isEditing: boolean) => {
  }, []);

  const handleSwitchBranch = useCallback(async (branchChatId: string) => {
    handleCancelEdit();
    await chatManager.setCurrentChat(branchChatId, true);
    const branchChat = chatManager.getChatById(branchChatId);
    if (branchChat) {
      setChat(branchChat);
      setMessages([...branchChat.messages]);
    }
  }, [handleCancelEdit]);

  const handleForkChat = useCallback(async (fromMsgIndex: number) => {
    const fork = await chatManager.forkChat(fromMsgIndex);
    if (fork) {
      setChat(fork);
      setMessages([...fork.messages]);
    }
  }, []);

  const handleRegenerate = async () => {
    if (messages.length < 2) return;
    
    try {
      await stopGenerationIfRunning();
      const settings = await getEffectiveSettings();

      const lastAssistantIdx = messages.length - 1;
      const fork = await chatManager.forkChat(lastAssistantIdx);
      if (!fork) {
        showDialog('Error', 'Failed to regenerate response');
        return;
      }

      const baseMessages = fork.messages.slice(0, -1);
      fork.messages = baseMessages;
      await chatManager.updateChatMessages(fork.id, baseMessages);
      setChat(fork);
      setMessages([...baseMessages]);

      await regenerationService.regenerateFromBase(
        baseMessages,
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
        );
      }
    } finally {
      resetStreamingState();
    }
  };

  const startNewChat = async () => {
    try {
      cancelGenerationRef.current = true;
      setIsLoading(false);
      setIsStreaming(false);
      setIsRegenerating(false);
      setStreamingMessage('');
      setStreamingThinking('');
      setStreamingMessageId(null);
      setStreamingStats(null);

      engineService.stop();
      if (activeProvider === 'apple-foundation') {
        appleFoundationService.cancel();
      }

      await ChatLifecycleService.startNewChat({ setChat, setMessages });
      cancelGenerationRef.current = false;
    } catch (error) {
      showDialog(
        'Error',
        'Failed to create new chat',
      );
    }
  };

  const handleModelSelect = useCallback(async (model: ProviderType, modelPath?: string, projectorPath?: string) => {
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
      setActiveProvider,
      setSelectedModelPath,
      showDialog,
      hideDialog,
      () => router.push('/(tabs)/settings')
    );
  }, [isLoading, isRegenerating, enableRemoteModels, isLoggedIn, loadModel, unloadModel, showDialog, hideDialog, router]);

  useEffect(() => {
    const cleanup = ModelManagementService.setupModelChangeListeners(
      setActiveProvider
    );
    return cleanup;
  }, []);

  const { keyboardHeight, keyboardDuration } = useKeyboard();
  const insets = useSafeAreaInsets();
  const kbSlideAnim = useRef(new Animated.Value(0)).current;
  const isKbOpen = keyboardHeight > 0;

  const useGlassLayout = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const [inputH, setInputH] = useState(72);
  const homePad = useGlassLayout && !isKbOpen ? insets.bottom : 0;
  const floatPad = useGlassLayout && !isKbOpen ? FLOAT_TAB : 0;
  const tabClear = homePad + floatPad;
  const listInset = useGlassLayout ? inputH + tabClear : 0;
  console.log('glass_layout', useGlassLayout, inputH, homePad, floatPad, tabClear, listInset);

  useEffect(() => {
    const offset = Platform.OS === 'ios'
      ? (isKbOpen ? keyboardHeight * 1.02 : 0)
      : Math.max(0, keyboardHeight - insets.bottom);
    Animated.timing(kbSlideAnim, {
      toValue: offset,
      duration: keyboardDuration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [keyboardHeight, keyboardDuration, insets.bottom, isKbOpen, kbSlideAnim]);


  if (!chat) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
        <Text style={{marginTop: 10, color: themeColors.text}}>Loading Chat...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: useGlassLayout ? 'transparent' : themeColors.background },
      ]}
      edges={
        Platform.OS === 'ios'
          ? (useGlassLayout || isKbOpen ? ['left', 'right'] : ['left', 'right', 'bottom'])
          : ['left', 'right']
      }
    >
      {useGlassLayout ? (
        <View
          pointerEvents="none"
          style={[styles.glassBg, { backgroundColor: themeColors.background }]}
        />
      ) : null}
      <GradientBg />
      <AppHeader 
        onNewChat={startNewChat}
        showLogo={!useIosHeader}
        title="InferrLM"
        rightButtons={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.headerButton, useIosHeader && styles.iosHeaderButton]}
              onPress={startNewChat}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons
                name="plus"
                size={22}
                color={useIosHeader && currentTheme === 'light' ? themeColors.primary : themeColors.headerText}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerButton, useIosHeader && styles.iosHeaderButton]}
              onPress={() => router.push('/chat-history')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons
                name="clock-outline"
                size={22}
                color={useIosHeader && currentTheme === 'light' ? themeColors.primary : themeColors.headerText}
              />
            </TouchableOpacity>
          </View>
        } 
      />
      <View style={[styles.modelSelectorContainer, { borderBottomColor: themeColors.borderColor }]}>
         <ModelSelectorComponent
            modelSelectorRef={modelSelectorRef}
            shouldOpenModelSelector={shouldOpenModelSelector}
            onClose={closeModelSelector}
            activeProvider={activeProvider}
            isLoading={isLoading || false}
            isRegenerating={isRegenerating || false}
            onModelSelect={handleModelSelect}
            style={styles.modelSelectorWrapper}
          />
      </View>
      <Animated.View style={{ flex: 1, paddingBottom: kbSlideAnim, overflow: 'visible' }}>
        {useGlassLayout ? (
          <View style={styles.chatOverlayContainer} collapsable={false}>
            <ChatView
              messages={messages}
              isStreaming={isStreaming}
              streamingMessageId={streamingMessageId}
              streamingMessage={streamingMessage}
              streamingThinking={streamingThinking}
              streamingStats={streamingStats}
              skillSteps={skillSteps}
              onCopyText={copyToClipboard}
              onRegenerateResponse={handleRegenerate}
              isRegenerating={isRegenerating}
              justCancelled={justCancelled}
              flatListRef={flatListRef}
              onEditMessageAndRegenerate={processMessage}
              onStopGeneration={stopGenerationIfRunning}
              onEditingStateChange={handleEditingStateChange}
              onStartEdit={handleStartEdit}
              chatId={chat?.id}
              onSwitchBranch={handleSwitchBranch}
              onForkChat={handleForkChat}
              bottomInset={listInset}
            />
            <View
              style={[styles.chatInputOverlay, { bottom: tabClear }]}
              pointerEvents="box-none"
              onLayout={(event) => {
                const nextH = Math.ceil(event.nativeEvent.layout.height);
                console.log('input_layout', nextH, tabClear);
                if (nextH > 0 && nextH !== inputH) {
                  setInputH(nextH);
                }
              }}
            >
              <ChatInput
                onSend={handleSend}
                disabled={isLoading || isModelLoading || isCooldown}
                isLoading={isLoading}
                isRegenerating={isRegenerating}
                onCancel={handleCancelGeneration}
                onStop={handleCancelGeneration}
                style={{ backgroundColor: 'transparent', borderTopWidth: 0 }}
                placeholderColor={themeColors.secondaryText}
                isEditing={isEditingMessage}
                editingText={editingMessageText}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={handleCancelEdit}
                chatId={chat.id}
              />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.chatContainer}>
              <ChatView
                messages={messages}
                isStreaming={isStreaming}
                streamingMessageId={streamingMessageId}
                streamingMessage={streamingMessage}
                streamingThinking={streamingThinking}
                streamingStats={streamingStats}
                skillSteps={skillSteps}
                onCopyText={copyToClipboard}
                onRegenerateResponse={handleRegenerate}
                isRegenerating={isRegenerating}
                justCancelled={justCancelled}
                flatListRef={flatListRef}
                onEditMessageAndRegenerate={processMessage}
                onStopGeneration={stopGenerationIfRunning}
                onEditingStateChange={handleEditingStateChange}
                onStartEdit={handleStartEdit}
                chatId={chat?.id}
                onSwitchBranch={handleSwitchBranch}
                onForkChat={handleForkChat}
              />
            </View>

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
              chatId={chat.id}
            />
          </>
        )}
      </Animated.View>

      <CopyToast visible={showCopyToast} message={copyToastMessage} />
      
      <MemoryWarningDialog 
        visible={showMemoryWarning}
        memoryWarningType={memoryWarningType}
        onClose={handleMemoryWarningClose}
      />

      <Dialog
        visible={dialogVisible}
        onDismiss={hideDialog}
        title={dialogTitle}
        description={dialogMessage}
        primaryButtonText={dialogPrimaryText}
        onPrimaryPress={dialogPrimaryPress}
        secondaryButtonText={dialogSecondaryText}
        onSecondaryPress={dialogSecondaryPress}
      />
    </SafeAreaView>
  );
} 