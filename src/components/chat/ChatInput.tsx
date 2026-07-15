import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { GlassView, isLiquidGlassAvailable, glassStyle } from '../../services/adapters/GlassEffectAdapter';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  AudioModule,
} from 'expo-audio';
import type { AudioRecorder, RecorderState } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { fs as FileSystem } from '../../services/fs';
import { useTheme } from '../../context/ThemeContext';
import { useModel } from '../../context/ModelContext';
import { theme } from '../../constants/theme';
import { getThemeAwareColor } from '../../utils/ColorUtils';
import FileViewerModal from '../FileViewerModal';
import CameraOverlay from '../CameraOverlay';
import { llamaManager } from '../../utils/LlamaManager';
import { Text } from 'react-native-paper';
import Dialog from '../Dialog';
import { engineService } from '../../services/runtime-service';
import AITermsDialog from './AITermsDialog';
import AsyncStorage from '@react-native-async-storage/async-storage';
import StopButton from '../StopButton';
import { RAGService, type RAGDocument, type RAGStorageType } from '../../services/rag/RAGService';
import type { ProviderType } from '../../services/ModelManagementService';
import chatManager from '../../utils/ChatManager';
import { uuidv4 } from 'react-native-rag';
import { OnlineModelService } from '../../services/OnlineModelService';
import { getMimeType } from '../../services/adapters/OpenAIFileAdapter';
import { attachStore } from '../../services/adapters/AttachStore';
import { sttAdapter } from '../../services/adapters/SttAdapter';
import { resolveAttachCaps } from '../../services/AttachmentCaps';
import { buildAttachMessage, withFallback } from '../../services/AttachmentCompat';
import AttachFallbackDialog from './AttachFallbackDialog';
import { useKeyboard } from '../../hooks/useKeyboard';
import type { AttachMode, ChatAttach } from '../../types/attachment';

type ChatInputProps = {
  onSend: (text: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  isRegenerating?: boolean;
  onCancel?: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
  style?: any;
  placeholderColor?: string;
  isEditing?: boolean;
  editingText?: string;
  onSaveEdit?: (text: string) => void;
  onCancelEdit?: () => void;
  chatId?: string;
};

const formatDuration = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

const litertHasMulti = (modelPath: string | null): boolean => {
  if (!modelPath) return false;
  const name = modelPath.toLowerCase();
  return name.includes('3n') || name.includes('gemma3') || name.includes('gemma-4') || name.includes('gemma4');
};

const remoteProviders: ProviderType[] = ['gemini', 'chatgpt', 'claude'];

const isRemoteProvider = (provider: string | null): boolean => {
  if (!provider) {
    return false;
  }
  const baseProvider = OnlineModelService.getBaseProvider(provider);
  return remoteProviders.includes(baseProvider as ProviderType);
};

const isOnlineProvider = (provider: string | null): boolean => {
  if (!provider) {
    return false;
  }
  if (provider === 'apple-foundation') {
    return true;
  }
  return isRemoteProvider(provider);
};

export default function ChatInput({ 
  onSend, 
  disabled = false,
  isLoading = false,
  isRegenerating = false,
  onCancel = () => {},
  onStop = () => {},
  style = {},
  placeholderColor,
  isEditing = false,
  editingText = '',
  onSaveEdit,
  onCancelEdit,
  chatId,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(52);
  const [fileModalVisible, setFileModalVisible] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{uri: string, name?: string} | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [useRagForUpload, setUseRagForUpload] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<ChatAttach | null>(null);
  const [fallbackVisible, setFallbackVisible] = useState(false);
  const [fallbackAttach, setFallbackAttach] = useState<ChatAttach | null>(null);
  const [fallbackReason, setFallbackReason] = useState<AttachMode>('needs-fallback');
  const [fallbackBusy, setFallbackBusy] = useState(false);
  
  const inputRef = useRef<TextInput>(null);
  const attachmentMenuAnim = useRef(new Animated.Value(0)).current;
  
  const { theme: currentTheme } = useTheme();
  const { selectedModelPath, isModelLoading, isMultimodalEnabled } = useModel();
  const themeColors = useMemo(() => theme[currentTheme as 'light' | 'dark'], [currentTheme]);
  const isDark = currentTheme === 'dark';
  const isRemoteModel = isRemoteProvider(selectedModelPath);
  const ragEnabledForCurrentModel = !!selectedModelPath && !isRemoteModel;
  const ragToggleDisabled = false;

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [showAITermsDialog, setShowAITermsDialog] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isProcessingWithRAG, setIsProcessingWithRAG] = useState(false);
  const [ragProgress, setRagProgress] = useState<{ completed: number; total: number } | null>(null);
  const ragCancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const [ragStatus, setRagStatus] = useState<{
    enabled: boolean;
    storage: RAGStorageType;
    ready: boolean;
    provider: ProviderType;
    documentCount: number;
    lastIngestedAt: number | null;
  } | null>(null);
  const [ragStatusLoading, setRagStatusLoading] = useState(false);
  const [ragClearing, setRagClearing] = useState(false);
  const [isAudioRecordingBusy, setIsAudioRecordingBusy] = useState(false);

  const { keyboardHeight } = useKeyboard();
  const isKbOpen = keyboardHeight > 0;

  const isGenerating = isLoading || isRegenerating;
  const hasText = text.trim().length > 0;
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const [recorderState, setRecorderState] = useState<RecorderState>({
    canRecord: false,
    isRecording: false,
    durationMillis: 0,
    mediaServicesDidReset: false,
    url: null,
  });
  const recorderPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ensureRecorder = useCallback(() => {
    if (audioRecorderRef.current) return audioRecorderRef.current;
    const recorder = new AudioModule.AudioRecorder(
      RecordingPresets.HIGH_QUALITY,
    );
    audioRecorderRef.current = recorder;

    const initial = recorder.getStatus();
    setRecorderState(initial);

    recorderPollRef.current = setInterval(() => {
      if (!audioRecorderRef.current) return;
      const newState = audioRecorderRef.current.getStatus();
      setRecorderState(prev => {
        if (
          prev.isRecording !== newState.isRecording ||
          prev.canRecord !== newState.canRecord ||
          prev.url !== newState.url ||
          Math.abs(prev.durationMillis - newState.durationMillis) > 50
        ) {
          return newState;
        }
        return prev;
      });
    }, 250);

    return recorder;
  }, []);

  const releaseRecorder = useCallback(() => {
    if (recorderPollRef.current) {
      clearInterval(recorderPollRef.current);
      recorderPollRef.current = null;
    }
    audioRecorderRef.current = null;
    setRecorderState({
      canRecord: false,
      isRecording: false,
      durationMillis: 0,
      mediaServicesDidReset: false,
      url: null,
    });
  }, []);

  useEffect(() => {
    return () => {
      if (recorderPollRef.current) {
        clearInterval(recorderPollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    loadTermsAcceptance();
  }, []);


  useEffect(() => {
    if (isEditing && editingText !== undefined) {
      setText(editingText);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else if (!isEditing) {
      setText('');
    }
  }, [isEditing, editingText]);

  const loadTermsAcceptance = async () => {
    try {
      const termsValue = await AsyncStorage.getItem('@ai_terms_accepted');
      setTermsAccepted(termsValue === 'true');
    } catch (error) {
    }
  };

  const handleAcceptTerms = async () => {
    try {
      await AsyncStorage.setItem('@ai_terms_accepted', 'true');
      setTermsAccepted(true);
      setShowAITermsDialog(false);
    } catch (error) {
    }
  };



  useEffect(() => {
    if (showAttachmentMenu) {
      Animated.spring(attachmentMenuAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    } else {
      Animated.spring(attachmentMenuAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    }
  }, [showAttachmentMenu]);

  const ensureRagToggleDefault = useCallback(() => {
    setUseRagForUpload(false);
  }, []);

  useEffect(() => {
    ensureRagToggleDefault();
  }, [ensureRagToggleDefault]);

  useEffect(() => {
    if (fileModalVisible || cameraVisible) {
      ensureRagToggleDefault();
    }
  }, [fileModalVisible, cameraVisible, ensureRagToggleDefault]);

  const showDialog = useCallback((title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogVisible(true);
  }, []);

  const hideDialog = () => setDialogVisible(false);

  const attachCaps = useMemo(() => {
    const support = llamaManager.getMultimodalSupport();
    return resolveAttachCaps(selectedModelPath, {
      mmprojReady: isMultimodalEnabled,
      llamaVision: support.vision,
      llamaAudio: support.audio,
      litertMultimodal: litertHasMulti(selectedModelPath),
    });
  }, [selectedModelPath, isMultimodalEnabled]);

  const queueAttach = useCallback(async (uri: string, name: string) => {
    console.log('attach_queue', name);
    try {
      const staged = await attachStore.stage(uri, name);
      if (!attachCaps.acceptMime(staged.mimeType, staged.name)) {
        console.log('attach_reject_mime', staged.name);
        showDialog('Unsupported File Type', 'This model does not support this file type.');
        return;
      }

      const mode = attachCaps.modeFor(staged.kind);
      console.log('attach_queue_mode', staged.kind, mode);

      if (mode === 'native') {
        setPendingAttachment(staged);
        setShowAttachmentMenu(false);
        setTimeout(() => inputRef.current?.focus(), 100);
        return;
      }

      setFallbackAttach(staged);
      setFallbackReason(mode);
      setFallbackVisible(true);
      setShowAttachmentMenu(false);
    } catch (error) {
      console.log('attach_queue_error', error instanceof Error ? error.message : error);
      showDialog('Error', 'Could not prepare the attachment. Please try again.');
    }
  }, [attachCaps, showDialog]);

  const isImageFile = (fileName: string): boolean => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'];
    const lowerCaseName = fileName.toLowerCase();
    return imageExtensions.some(ext => lowerCaseName.endsWith(ext));
  };

  const handleToggleRagForUpload = useCallback((value: boolean) => {
    if (!ragEnabledForCurrentModel) {
      setUseRagForUpload(false);
      return;
    }
    if (ragToggleDisabled) {
      return;
    }
    setUseRagForUpload(value);
  }, [ragEnabledForCurrentModel, ragToggleDisabled]);

  const refreshRagStatus = useCallback(async () => {
    setRagStatusLoading(true);
    try {
      const status = await RAGService.getStatus();
      setRagStatus(status);
    } catch (error) {
    } finally {
      setRagStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshRagStatus();
  }, [refreshRagStatus, chatId]);

  useEffect(() => {
    const unsubscribe = chatManager.addListener(refreshRagStatus);
    return () => {
      unsubscribe();
    };
  }, [refreshRagStatus]);

  const handleClearRetrieval = useCallback(async () => {
    if (ragClearing) {
      return;
    }
    setRagClearing(true);
    try {
      await RAGService.clear();
      await refreshRagStatus();
    } catch (error) {
      showDialog('Retrieval reset failed', 'Unable to clear stored retrieval data.');
    } finally {
      setRagClearing(false);
    }
  }, [ragClearing, refreshRagStatus, showDialog]);

  const formatRelativeTime = useCallback((timestamp: number | null) => {
    if (!timestamp) {
      return 'never';
    }
    const diff = Date.now() - timestamp;
    if (diff < 15000) {
      return 'just now';
    }
    if (diff < 60000) {
      return `${Math.floor(diff / 1000)}s ago`;
    }
    if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}m ago`;
    }
    if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}h ago`;
    }
    const days = Math.floor(diff / 86400000);
    return `${days}d ago`;
  }, []);

  const ragStatusLabel = useMemo(() => {
    if (!ragStatus) {
      return 'Checking retrieval status…';
    }
    if (!ragStatus.enabled) {
      return 'Retrieval disabled';
    }
    if (!ragStatus.ready) {
      return 'Retrieval initializing';
    }
    return 'Retrieval ready';
  }, [ragStatus]);

  const ragStatusDetails = useMemo(() => {
    if (!ragStatus || !ragStatus.enabled) {
      return 'Enable RAG to store files for this chat.';
    }
    const lastSeen = formatRelativeTime(ragStatus.lastIngestedAt);
    const storageLabel = ragStatus.storage === 'persistent' ? 'Persistent store' : 'Memory store';
    return `${ragStatus.documentCount} docs · ${storageLabel} · updated ${lastSeen}`;
  }, [ragStatus, formatRelativeTime]);

  const showRagStatus = ragEnabledForCurrentModel && (ragStatus?.documentCount ?? 0) > 0;

  const toggleAttachmentMenu = () => {
    setShowAttachmentMenu(!showAttachmentMenu);
  };

  const supportsAudioUpload = useCallback(() => {
    return attachCaps.modeFor('audio') === 'native'
      || attachCaps.modeFor('audio') === 'needs-mmproj'
      || attachCaps.modeFor('audio') === 'needs-fallback';
  }, [attachCaps]);

  const ensureAttachReady = useCallback((attach: ChatAttach): boolean => {
    const mode = attachCaps.modeFor(attach.kind);
    if (attach.textFallback?.text) {
      return true;
    }
    if (mode === 'native') {
      return true;
    }
    console.log('attach_send_blocked', attach.kind, mode);
    setFallbackAttach(attach);
    setFallbackReason(mode);
    setFallbackVisible(true);
    return false;
  }, [attachCaps]);

  const handleSend = useCallback(() => {
    if (!hasText && !pendingAttachment) return;

    if (isEditing) {
      onSaveEdit?.(text);
      setText('');
      setInputHeight(52);
      return;
    }

    if (!selectedModelPath) {
      showDialog(
        'No Model Selected',
        'Please select a model before sending a message.'
      );
      return;
    }

    const isOnlineModel = isOnlineProvider(selectedModelPath);
    const engineReady = engineService.ready();

    if (!isOnlineModel && (!engineReady || isModelLoading)) {
      console.log('model_send_blocked', {
        engineReady,
        isModelLoading,
        engine: engineService.get(),
        activePath: engineService.getActiveModelPath(),
        selected: selectedModelPath,
      });
      showDialog(
        'Model Not Ready',
        isModelLoading
          ? 'Please wait for the local model to finish loading before sending a message.'
          : 'The local model is not loaded in memory. Please select it again from Active Model.'
      );
      return;
    }

    if (pendingAttachment) {
      if (!ensureAttachReady(pendingAttachment)) {
        return;
      }

      const prompt = text.trim();
      const attachment = pendingAttachment;
      setText('');
      setInputHeight(52);
      setShowAttachmentMenu(false);
      setPendingAttachment(null);

      console.log('attach_send', attachment.kind, !!attachment.textFallback);
      onSend(buildAttachMessage([attachment], prompt));
      return;
    }
    
    try {
      onSend(text);
    } catch (error) {
      console.log('chat_input_send_error', error instanceof Error ? error.message : error);
    }
    setText('');
    setInputHeight(52);
    setShowAttachmentMenu(false);
  }, [text, onSend, selectedModelPath, isModelLoading, hasText, isEditing, onSaveEdit, pendingAttachment, ensureAttachReady]);

  const handleContentSizeChange = useCallback((event: any) => {
    const height = Math.min(120, Math.max(52, event.nativeEvent.contentSize.height + 8));
    setInputHeight(height);
  }, []);

  const processRagDocument = useCallback(
    async (
      content: string,
      displayName: string,
      fileType?: string,
    ): Promise<{ handled: boolean; cancelled: boolean; documentId?: string }> => {
      let handled = false;
      let cancelled = false;
      let documentId: string | undefined;
      let ragIndicatorActive = false;
      const chatId = chatManager.getCurrentChatId() || undefined;

      try {
        if (!ragEnabledForCurrentModel) {
          return { handled, cancelled, documentId };
        }
        const enabled = await RAGService.isEnabled();
        if (!enabled) {
          return { handled, cancelled, documentId };
        }

        const isRemoteOrApple = isOnlineProvider(selectedModelPath);
        if (!isRemoteOrApple && !engineService.mgr().ready()) {
          showDialog('Model not ready', 'Load a local model before using retrieval.');
          return { handled, cancelled, documentId };
        }

        ragIndicatorActive = true;
        setIsProcessingWithRAG(true);
        ragCancelRef.current.cancelled = false;
        setRagProgress({ completed: 0, total: 0 });

      const provider: ProviderType = isRemoteOrApple ? (selectedModelPath as ProviderType) : 'local';
        await RAGService.initialize(provider);

        if (!RAGService.isReady()) {
          return { handled, cancelled, documentId };
        }

        documentId = uuidv4();
        const ragDocument: RAGDocument = {
          id: documentId,
          content,
          fileName: displayName,
          fileType,
          timestamp: Date.now(),
          chatId,
          provider,
        };

        await RAGService.addDocument(ragDocument, {
          onProgress: (completed, total) => {
            setRagProgress({ completed, total });
            console.log('rag_progress', documentId, `${completed}/${total}`);
          },
          isCancelled: () => ragCancelRef.current.cancelled,
        });
  handled = true;
  console.log('file_rag_store', displayName, documentId, content.length);
  await refreshRagStatus();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'unknown';
        console.log('file_upload_error', errorMessage);
        if (error instanceof Error && error.message === 'rag_upload_cancelled') {
          cancelled = true;
          console.log('file_upload_cancelled', displayName);
        } else {
          if (errorMessage.includes('api_key_missing')) {
            const providerLabel = selectedModelPath === 'apple-foundation'
              ? 'Apple Intelligence'
              : (selectedModelPath || 'local');
            showDialog('API Key Required', `Add a ${providerLabel} API key in Settings to use retrieval.`);
          } else {
            showDialog('Retrieval error', 'Document could not be stored for retrieval. Sending full content instead.');
          }
        }
      } finally {
        if (ragIndicatorActive) {
          setIsProcessingWithRAG(false);
        }
      }

      return { handled, cancelled, documentId };
    },
    [showDialog, selectedModelPath, refreshRagStatus, ragEnabledForCurrentModel]
  );

  const handleFileUpload = useCallback(
    async (content: string, fileName?: string, userPrompt?: string, useRagFlag = true) => {
      const displayName = fileName || 'unnamed file';
      const sanitizedPrompt = userPrompt ? userPrompt.trim() : '';
      const userMessage = sanitizedPrompt || `File uploaded: ${displayName}`;
      console.log('file_upload_start', displayName, useRagFlag ? 'rag_on' : 'rag_off');

      const buildInternalInstruction = (fileBody?: string) => {
        const sections: string[] = [`You're reading a file named: ${displayName}`];
        if (sanitizedPrompt) {
          sections.push(`User request: ${sanitizedPrompt}`);
        }
        if (!sanitizedPrompt && userMessage) {
          sections.push(`User request: ${userMessage}`);
        }
        const fileSection = fileBody && fileBody.length > 0
          ? `--- FILE START ---\n${fileBody}\n--- FILE END ---`
          : `--- FILE START ---\n--- FILE END ---`;
        sections.push(fileSection);
        return sections.join('\n\n');
      };

      let ragHandled = false;
      let ragCancelled = false;
      let documentId: string | undefined;

      if (useRagFlag && ragEnabledForCurrentModel) {
        const result = await processRagDocument(
          content,
          displayName,
          displayName.split('.').pop()?.toLowerCase()
        );
        ragHandled = result.handled;
        ragCancelled = result.cancelled;
        documentId = result.documentId;

        if (ragHandled && documentId) {
          const messageObject = {
            type: 'file_upload',
            fileName: displayName,
            internalInstruction: buildInternalInstruction(),
            userContent: userMessage,
            metadata: { ragDocumentId: documentId },
          };

          console.log('file_internal', messageObject.internalInstruction);
          console.log('file_prompt', userMessage);
          console.log('file_content', content);
          console.log('file_upload_rag', displayName, documentId, content.length, sanitizedPrompt || 'no_prompt');
          onSend(JSON.stringify(messageObject));
        }
      }

      if (!ragHandled && !ragCancelled) {
        const fallbackObject = {
          type: 'file_upload',
          fileName: displayName,
          internalInstruction: buildInternalInstruction(content),
          userContent: userMessage,
          metadata: { ragDisabled: true },
        };
        console.log('file_internal', fallbackObject.internalInstruction);
        console.log('file_prompt', userMessage);
        console.log('file_content', content);
        console.log('file_upload_fallback', displayName, content.length, sanitizedPrompt || 'no_prompt');
        onSend(JSON.stringify(fallbackObject));
      }

      setShowAttachmentMenu(false);
      setRagProgress(null);
      ragCancelRef.current.cancelled = false;
      console.log('file_upload_complete', displayName, ragCancelled ? 'cancelled' : ragHandled ? 'rag' : 'fallback');
    },
    [onSend, processRagDocument, selectedModelPath, selectedFile, showDialog]
  );

  const handleRemoteUpload = useCallback(async (fileUri: string, fileName: string, userPrompt?: string) => {
    const displayName = fileName || 'document';
    const promptText = userPrompt?.trim() || '';
    const userContent = promptText || `File uploaded: ${displayName}`;

    try {
      const uploadsDir = `${FileSystem.documentDirectory}uploads`;
      await FileSystem.makeDirectoryAsync(uploadsDir, { intermediates: true });
      const destPath = `${uploadsDir}/${uuidv4()}_${displayName}`;
      await FileSystem.copyAsync({ from: fileUri, to: destPath });

      const mimeType = getMimeType(displayName);
      onSend(JSON.stringify({
        type: 'file_upload',
        fileName: displayName,
        userContent,
        metadata: { remoteFileUri: destPath, mimeType },
      }));
      console.log('remote_upload_file', displayName);
    } catch (error) {
      console.log('remote_upload_error', error instanceof Error ? error.message : 'unknown');
      showDialog('Upload Error', 'Failed to process file.');
    }
  }, [selectedModelPath, onSend, showDialog]);

  const markRagDisabled = useCallback((raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      const metadata = { ...(parsed.metadata || {}), ragDisabled: true };
      return JSON.stringify({ ...parsed, metadata });
    } catch {
      return raw;
    }
  }, []);

  const processOcrRagIfNeeded = useCallback(
    async (messageContent: string): Promise<{ finalMessage: string; cancelled: boolean }> => {
      try {
        const parsed = JSON.parse(messageContent);

        if (parsed?.type === 'multimodal') {
          return { finalMessage: messageContent, cancelled: false };
        }

        if (!useRagForUpload || !ragEnabledForCurrentModel) {
          return { finalMessage: markRagDisabled(messageContent), cancelled: false };
        }

        if (parsed?.type === 'ocr_result' && typeof parsed.extractedText === 'string') {
          const displayName = parsed?.fileName || 'ocr_document';
          const result = await processRagDocument(parsed.extractedText, displayName, 'ocr');

          if (result.cancelled) {
            return { finalMessage: messageContent, cancelled: true };
          }

          if (result.handled && result.documentId) {
            parsed.metadata = { ...(parsed.metadata || {}), ragDocumentId: result.documentId };
            return { finalMessage: JSON.stringify(parsed), cancelled: false };
          }

          parsed.metadata = { ...(parsed.metadata || {}), ragDisabled: true };
          return { finalMessage: JSON.stringify(parsed), cancelled: false };
        }
      } catch (error) {
        console.log('ocr_rag_parse_error');
      }

      return { finalMessage: markRagDisabled(messageContent), cancelled: false };
    },
    [processRagDocument, useRagForUpload, ragEnabledForCurrentModel, markRagDisabled]
  );

  const handleImageUpload = useCallback((messageContent: string) => {
    processOcrRagIfNeeded(messageContent)
      .then(({ finalMessage, cancelled }) => {
        if (cancelled) {
          setRagProgress(null);
          ragCancelRef.current.cancelled = false;
          return;
        }

        setRagProgress(null);
        ragCancelRef.current.cancelled = false;
        onSend(finalMessage);
        setShowAttachmentMenu(false);
      })
      .catch(() => {
        setRagProgress(null);
        ragCancelRef.current.cancelled = false;
      });
  }, [onSend, processOcrRagIfNeeded]);

  const handlePhotoTaken = useCallback((photoUri: string, messageContent: string) => {
    processOcrRagIfNeeded(messageContent)
      .then(({ finalMessage, cancelled }) => {
        if (cancelled) {
          setRagProgress(null);
          ragCancelRef.current.cancelled = false;
          return;
        }

        setRagProgress(null);
        ragCancelRef.current.cancelled = false;
        onSend(finalMessage);
        setShowAttachmentMenu(false);
      })
      .catch(() => {
        setRagProgress(null);
        ragCancelRef.current.cancelled = false;
      });
  }, [onSend, processOcrRagIfNeeded]);

  const openCamera = useCallback(() => {
    if (!selectedModelPath) {
      showDialog(
        'No Model Selected',
        'Please select a model before taking a photo.'
      );
      return;
    }

    console.log('attach_camera_open');
    setCameraVisible(true);
    setShowAttachmentMenu(false);
  }, [selectedModelPath, showDialog]);

  const closeCamera = useCallback(() => {
    setCameraVisible(false);
  }, []);

  const pickDocument = useCallback(async () => {
    if (!selectedModelPath) {
      showDialog(
        'No Model Selected',
        'Please select a model before uploading a file.'
      );
      return;
    }
    
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const fileName = file.name || 'document';
        console.log('attach_pick_file', fileName);

        if (isImageFile(fileName)) {
          setSelectedFile({
            uri: file.uri,
            name: fileName
          });
          setFileModalVisible(true);
          setShowAttachmentMenu(false);
          return;
        }

        if (isRemoteModel || attachCaps.documents === 'native-upload') {
          await queueAttach(file.uri, fileName);
          return;
        }

        setSelectedFile({
          uri: file.uri,
          name: fileName
        });
        setFileModalVisible(true);
        setShowAttachmentMenu(false);
      }
    } catch (error) {
      console.log('attach_pick_error', error instanceof Error ? error.message : error);
      showDialog('Error', 'Could not pick the document. Please try again.');
    }
  }, [selectedModelPath, attachCaps, queueAttach, showDialog]);

  const pickAudio = useCallback(async () => {
    if (!selectedModelPath) {
      showDialog('No Model Selected', 'Please select a model before attaching audio.');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const fileName = file.name || 'audio-file';
        console.log('attach_pick_audio', fileName);
        await queueAttach(file.uri, fileName);
      }
    } catch {
      showDialog('Error', 'Could not pick the audio file. Please try again.');
    }
  }, [selectedModelPath, showDialog, queueAttach]);

  const startAudioRecording = useCallback(async () => {
    if (!selectedModelPath) {
      showDialog('No Model Selected', 'Please select a model before recording audio.');
      return;
    }

    try {
      setIsAudioRecordingBusy(true);
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        showDialog('Microphone Access Needed', 'Allow microphone access to record audio inside chat.');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      const recorder = ensureRecorder();
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPendingAttachment(null);
      setShowAttachmentMenu(false);
      console.log('attach_record_start');
    } catch {
      showDialog('Recording Failed', 'Could not start audio recording. Please try again.');
    } finally {
      setIsAudioRecordingBusy(false);
    }
  }, [ensureRecorder, selectedModelPath, showDialog]);

  const stopAudioRecording = useCallback(async (discard = false) => {
    try {
      setIsAudioRecordingBusy(true);
      const recorder = ensureRecorder();
      await recorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      const uri = recorder.uri || recorderState.url;
      if (!discard && uri) {
        const name = uri.split('/').pop() || `recording-${Date.now()}.m4a`;
        console.log('attach_record_stop', name);
        await queueAttach(uri, name);
      }
      releaseRecorder();
    } catch {
      if (!discard) {
        showDialog('Recording Failed', 'Could not finish audio recording. Please try again.');
      }
    } finally {
      setIsAudioRecordingBusy(false);
    }
  }, [ensureRecorder, releaseRecorder, recorderState.url, showDialog, queueAttach]);

  const toggleAudioRecording = useCallback(async () => {
    if (isAudioRecordingBusy) {
      return;
    }

    if (recorderState.isRecording) {
      await stopAudioRecording(false);
      return;
    }

    await startAudioRecording();
  }, [recorderState.isRecording, isAudioRecordingBusy, startAudioRecording, stopAudioRecording]);

  const closeFallback = useCallback(() => {
    setFallbackVisible(false);
    setFallbackAttach(null);
    setFallbackBusy(false);
  }, []);

  const handleFallbackRemove = useCallback(() => {
    console.log('attach_fallback_remove');
    closeFallback();
    setPendingAttachment(null);
  }, [closeFallback]);

  const handleFallbackStt = useCallback(async () => {
    if (!fallbackAttach?.uri) {
      console.log('attach_stt_missing');
      closeFallback();
      return;
    }
    if (!sttAdapter.isReady()) {
      showDialog('STT Unavailable', 'Speech-to-text is not available on this device. Remove the attachment or switch to an audio-capable model.');
      return;
    }
    try {
      setFallbackBusy(true);
      console.log('attach_stt_start');
      const text = await sttAdapter.transcribe(fallbackAttach.uri);
      const updated = withFallback(fallbackAttach, { mode: 'stt', text });
      setPendingAttachment(updated);
      console.log('attach_stt_done', text.length);
      closeFallback();
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (error) {
      console.log('attach_stt_error', error instanceof Error ? error.message : error);
      showDialog('STT Failed', 'Could not transcribe this audio file.');
      setFallbackBusy(false);
    }
  }, [fallbackAttach, closeFallback, showDialog]);

  const closeFileModal = useCallback(() => {
    setFileModalVisible(false);
  }, []);

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  const handleStop = () => {
    if (onStop) {
      onStop();
    }
  };



  const useGlassEffect = useMemo(() => 
    isLiquidGlassAvailable()
  , []);

  const glassEffectStyle = useMemo(() => 
    glassStyle(isDark)
  , [isDark]);

  const inputContainerStyle = useMemo(() => [
    styles.inputContainer,
    useGlassEffect
      ? {
          borderWidth: isDark ? 0 : 0.5,
          borderColor: isDark ? undefined : 'rgba(0, 0, 0, 0.12)',
        }
      : {
          backgroundColor: isDark ? themeColors.background : '#ffffff',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        },
    {
      minHeight: inputHeight,
    },
  ], [inputHeight, isDark, themeColors.background, useGlassEffect]);

  const inputStyle = useMemo(() => [
    styles.input,
    {
      color: isDark ? themeColors.text : '#000000',
      height: Math.max(40, inputHeight - 12),
    },
  ], [inputHeight, isDark, themeColors.text]);

  const defaultPlaceholderColor = useMemo(() => 
    isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.4)'
  , [isDark]);

  const canSend = hasText || !!pendingAttachment;

  const sendButtonStyle = useMemo(() => [
    styles.sendButton,
    useGlassEffect
      ? {}
      : {
          backgroundColor: canSend 
            ? getThemeAwareColor('#4a0660', currentTheme)
            : isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
        },
  ], [canSend, currentTheme, isDark, useGlassEffect]);

  const sendIconColor = useMemo(() => {
    if (canSend) {
      return useGlassEffect && !isDark
        ? getThemeAwareColor('#4a0660', currentTheme)
        : '#ffffff';
    }
    return isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)';
  }, [canSend, isDark, useGlassEffect, currentTheme]);

  const attachmentButtonStyle = useMemo(() => [
    styles.attachmentButton,
    useGlassEffect
      ? {}
      : {
          backgroundColor: showAttachmentMenu 
            ? getThemeAwareColor('#4a0660', currentTheme)
            : isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
        },
  ], [showAttachmentMenu, currentTheme, isDark, useGlassEffect]);

  const attachmentIconColor = useMemo(() => {
    if (showAttachmentMenu) {
      return useGlassEffect && !isDark
        ? getThemeAwareColor('#4a0660', currentTheme)
        : '#ffffff';
    }
    return isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
  }, [showAttachmentMenu, isDark, useGlassEffect, currentTheme]);


  return (
    <View style={[
      styles.wrapper,
      isKbOpen && (Platform.OS === 'android' ? styles.wrapperCompactAndroid : styles.wrapperCompact),
    ]}>
      {isProcessingWithRAG && (
        <View
          style={[
            styles.ragBanner,
            {
              backgroundColor: isDark ? 'rgba(74, 6, 96, 0.25)' : 'rgba(74, 6, 96, 0.08)',
            },
          ]}
        >
          <ActivityIndicator size="small" color={getThemeAwareColor('#4a0660', currentTheme)} />
          <Text style={[styles.ragBannerText, { color: isDark ? '#ffffff' : getThemeAwareColor('#4a0660', currentTheme) }]}>Storing document for retrieval {ragProgress ? `(${ragProgress.completed}/${ragProgress.total || '?'})` : ''}</Text>
          <TouchableOpacity
            onPress={() => {
              ragCancelRef.current.cancelled = true;
              setRagProgress(null);
              setIsProcessingWithRAG(false);
            }}
            style={styles.ragCancelButton}
          >
            <MaterialCommunityIcons name="close" size={16} color={isDark ? '#ffffff' : getThemeAwareColor('#4a0660', currentTheme)} />
          </TouchableOpacity>
        </View>
      )}
      <TouchableWithoutFeedback onPress={() => {
        Keyboard.dismiss();
        setShowAttachmentMenu(false);
      }}>
        <View style={[styles.container, style]}>
          {showAttachmentMenu && !isEditing && (
            <Animated.View
              style={[
                                 styles.attachmentMenu,
                 {
                   backgroundColor: isDark ? themeColors.background : '#ffffff',
                   borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                  transform: [
                    {
                      translateY: attachmentMenuAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                      }),
                    },
                    {
                      scale: attachmentMenuAnim,
                    },
                  ],
                  opacity: attachmentMenuAnim,
                },
              ]}
            >
              <TouchableOpacity style={styles.attachmentMenuItem} onPress={pickDocument}>
                <View style={[styles.attachmentMenuIcon, { backgroundColor: '#4285f4' }]}>
                  <MaterialCommunityIcons name="file-document-outline" size={20} color="#ffffff" />
                </View>
                <Text style={[styles.attachmentMenuText, { color: isDark ? themeColors.text : '#000000' }]}>
                  File
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.attachmentMenuItem} onPress={openCamera}>
                <View style={[styles.attachmentMenuIcon, { backgroundColor: '#34a853' }]}>
                  <MaterialCommunityIcons name="camera-outline" size={20} color="#ffffff" />
                </View>
                <Text style={[styles.attachmentMenuText, { color: isDark ? themeColors.text : '#000000' }]}>
                  Camera
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.attachmentMenuItem} onPress={pickAudio}>
                <View style={[styles.attachmentMenuIcon, { backgroundColor: '#f39c12' }]}> 
                  <MaterialCommunityIcons name="file-music-outline" size={20} color="#ffffff" />
                </View>
                <Text style={[styles.attachmentMenuText, { color: isDark ? themeColors.text : '#000000' }]}> 
                  Audio File
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.attachmentMenuItem} onPress={toggleAudioRecording}>
                <View style={[styles.attachmentMenuIcon, { backgroundColor: recorderState.isRecording ? '#c0392b' : '#8e44ad' }]}> 
                  {isAudioRecordingBusy ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <MaterialCommunityIcons name={recorderState.isRecording ? 'stop-circle-outline' : 'microphone-outline'} size={20} color="#ffffff" />
                  )}
                </View>
                <Text style={[styles.attachmentMenuText, { color: isDark ? themeColors.text : '#000000' }]}> 
                  {recorderState.isRecording ? 'Stop' : 'Record'}
                </Text>
              </TouchableOpacity>
              
            </Animated.View>
          )}

          {recorderState.isRecording && (
            <View style={styles.attachmentChip}>
              <View style={[styles.pendingFileRow, { backgroundColor: themeColors.borderColor }]}> 
                <View style={[styles.pendingFileIcon, { backgroundColor: '#c0392b' }]}> 
                  <MaterialCommunityIcons name="microphone" size={18} color="#ffffff" />
                </View>
                <View style={styles.pendingFileInfo}>
                  <Text style={[styles.pendingFileName, { color: themeColors.text }]} numberOfLines={1}>
                    Recording audio
                  </Text>
                  <Text style={[styles.pendingFileSubtitle, { color: themeColors.secondaryText }]}>
                    {formatDuration(recorderState.durationMillis / 1000)} elapsed
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => stopAudioRecording(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.pendingFileClose}
                >
                  <MaterialCommunityIcons
                    name="stop-circle-outline"
                    size={18}
                    color={isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)'}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => stopAudioRecording(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.pendingFileClose}
                >
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={18}
                    color={isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'}
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {pendingAttachment && (() => {
            const ext = pendingAttachment.name.split('.').pop()?.toLowerCase() || '';
            const typeColors: Record<string, string> = {
              pdf: '#FF5252', doc: '#2196F3', docx: '#2196F3',
              xls: '#4CAF50', xlsx: '#4CAF50', ppt: '#FF9800', pptx: '#FF9800',
              jpg: '#9C27B0', jpeg: '#9C27B0', png: '#9C27B0', gif: '#9C27B0',
              mp3: '#f39c12', wav: '#f39c12', m4a: '#f39c12', aac: '#f39c12',
              zip: '#795548', rar: '#795548', '7z': '#795548',
              js: '#FFC107', ts: '#FFC107', py: '#3F51B5',
              html: '#FF5722', css: '#FF5722',
            };
            const typeBg = typeColors[ext] || '#9E9E9E';
            const typeLabel = ext ? (ext.length > 4 ? ext.substring(0, 4) : ext).toUpperCase() : 'FILE';
            return (
              <View style={styles.attachmentChip}>
                <View style={[styles.pendingFileRow, { backgroundColor: themeColors.borderColor }]}>
                  <View style={[styles.pendingFileIcon, { backgroundColor: typeBg }]}>
                    <Text style={styles.pendingFileTypeText}>{typeLabel}</Text>
                  </View>
                  <View style={styles.pendingFileInfo}>
                    <Text style={[styles.pendingFileName, { color: themeColors.text }]} numberOfLines={1} ellipsizeMode="middle">
                      {pendingAttachment.name}
                    </Text>
                    <Text style={[styles.pendingFileSubtitle, { color: themeColors.secondaryText }]}>
                      {pendingAttachment.textFallback
                        ? `${pendingAttachment.textFallback.mode.toUpperCase()} fallback`
                        : pendingAttachment.kind === 'audio'
                          ? 'Audio attachment'
                          : pendingAttachment.kind === 'image'
                            ? 'Image attachment'
                            : 'File attachment'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPendingAttachment(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.pendingFileClose}
                  >
                    <MaterialCommunityIcons
                      name="close-circle"
                      size={18}
                      color={isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}

          <View style={styles.inputWrapper}>
            {!isEditing && (
              useGlassEffect ? (
                <GlassView
                  style={[attachmentButtonStyle, styles.glassCircle]}
                  glassEffectStyle={glassEffectStyle}
                  isInteractive
                  colorScheme={isDark ? 'dark' : 'light'}
                >
                  <TouchableOpacity 
                    style={[styles.attachmentButton, { backgroundColor: 'transparent' }]}
                    onPress={toggleAttachmentMenu}
                    disabled={disabled}
                  >
                    <MaterialCommunityIcons 
                      name={showAttachmentMenu ? "close" : "plus"} 
                      size={20} 
                      color={attachmentIconColor} 
                    />
                  </TouchableOpacity>
                </GlassView>
              ) : (
                <TouchableOpacity 
                  style={attachmentButtonStyle} 
                  onPress={toggleAttachmentMenu}
                  disabled={disabled}
                >
                  <MaterialCommunityIcons 
                    name={showAttachmentMenu ? "close" : "plus"} 
                    size={20} 
                    color={attachmentIconColor} 
                  />
                </TouchableOpacity>
              )
            )}


            {useGlassEffect ? (
              <GlassView
                style={inputContainerStyle}
                glassEffectStyle={glassEffectStyle}
                isInteractive
                colorScheme={isDark ? 'dark' : 'light'}
              >
                <TextInput
                  ref={inputRef}
                  style={inputStyle}
                  placeholder={isEditing ? "Edit your message..." : "Type a message..."}
                  placeholderTextColor={placeholderColor || defaultPlaceholderColor}
                  value={text}
                  onChangeText={setText}
                  onContentSizeChange={handleContentSizeChange}
                  multiline
                  maxLength={10000}
                  editable={!disabled}
                  returnKeyType="default"
                  textAlignVertical="center"
                />
              </GlassView>
            ) : (
              <View style={inputContainerStyle}>
                <TextInput
                  ref={inputRef}
                  style={inputStyle}
                  placeholder={isEditing ? "Edit your message..." : "Type a message..."}
                  placeholderTextColor={placeholderColor || defaultPlaceholderColor}
                  value={text}
                  onChangeText={setText}
                  onContentSizeChange={handleContentSizeChange}
                  multiline
                  maxLength={10000}
                  editable={!disabled}
                  returnKeyType="default"
                  textAlignVertical="center"
                />
              </View>
            )}

            {isEditing ? (
              <View style={styles.editingActions}>
                <TouchableOpacity 
                  style={[styles.editButton, { backgroundColor: isDark ? '#444' : '#f0f0f0' }]} 
                  onPress={onCancelEdit}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons 
                    name="close" 
                    size={20} 
                    color={isDark ? '#fff' : '#666'} 
                  />
                </TouchableOpacity>
                {useGlassEffect ? (
                  <GlassView
                    style={[sendButtonStyle, styles.glassCircle]}
                    glassEffectStyle={glassEffectStyle}
                    isInteractive
                    colorScheme={isDark ? 'dark' : 'light'}
                  >
                    <TouchableOpacity 
                      style={[styles.sendButton, { backgroundColor: 'transparent' }]}
                      onPress={handleSend}
                      disabled={!hasText || disabled}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons 
                        name="check" 
                        size={20} 
                        color={sendIconColor} 
                      />
                    </TouchableOpacity>
                  </GlassView>
                ) : (
                  <TouchableOpacity 
                    style={sendButtonStyle} 
                    onPress={handleSend}
                    disabled={!hasText || disabled}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons 
                      name="check" 
                      size={20} 
                      color={sendIconColor} 
                    />
                  </TouchableOpacity>
                )}
              </View>
            ) : isGenerating ? (
              useGlassEffect ? (
                <GlassView
                  style={[styles.stopButton, styles.glassCircle]}
                  glassEffectStyle={glassEffectStyle}
                  isInteractive
                  colorScheme={isDark ? 'dark' : 'light'}
                >
                  <StopButton 
                    onPress={handleStop}
                    color="#ff4444"
                    size={24}
                    touchableOpacityProps={{
                      style: [styles.stopButton, { backgroundColor: 'transparent' }]
                    }}
                  />
                </GlassView>
              ) : (
                <StopButton 
                  onPress={handleStop}
                  color="#ff4444"
                  size={24}
                  touchableOpacityProps={{
                    style: styles.stopButton
                  }}
                />
              )
            ) : (
              useGlassEffect ? (
                <GlassView
                  style={[sendButtonStyle, styles.glassCircle]}
                  glassEffectStyle={glassEffectStyle}
                  isInteractive
                  colorScheme={isDark ? 'dark' : 'light'}
                >
                  <TouchableOpacity 
                    style={[styles.sendButton, { backgroundColor: 'transparent' }]}
                    onPress={handleSend}
                    disabled={!canSend || disabled}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons 
                      name="send" 
                      size={20} 
                      color={sendIconColor} 
                    />
                  </TouchableOpacity>
                </GlassView>
              ) : (
                <TouchableOpacity 
                  style={sendButtonStyle} 
                  onPress={handleSend}
                  disabled={!canSend || disabled}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons 
                    name="send" 
                    size={20} 
                    color={sendIconColor} 
                  />
                </TouchableOpacity>
              )
            )}
          </View>
        </View>
      </TouchableWithoutFeedback>

      {showRagStatus && (
        <View
          style={[
            styles.ragStatusContainer,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <View
            style={[
              styles.ragStatusIndicator,
              {
                backgroundColor: !ragStatus || !ragStatus.enabled
                  ? '#b0b0b0'
                  : ragStatus.ready
                    ? '#34a853'
                    : '#ffb300',
              },
            ]}
          />
          <View style={styles.ragStatusTextContainer}>
            <Text
              style={[
                styles.ragStatusTitle,
                { color: isDark ? '#ffffff' : '#000000' },
              ]}
            >
              {ragStatusLabel}
            </Text>
            <Text
              style={[
                styles.ragStatusSubtitle,
                { color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)' },
              ]}
              numberOfLines={1}
            >
              {ragStatusDetails}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.ragStatusRefresh}
            onPress={refreshRagStatus}
            disabled={ragStatusLoading}
          >
            {ragStatusLoading ? (
              <ActivityIndicator size="small" color={getThemeAwareColor('#4a0660', currentTheme)} />
            ) : (
              <MaterialCommunityIcons
                name="refresh"
                size={18}
                color={getThemeAwareColor('#4a0660', currentTheme)}
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ragStatusRefresh}
            onPress={handleClearRetrieval}
            disabled={ragClearing}
          >
            {ragClearing ? (
              <ActivityIndicator size="small" color={getThemeAwareColor('#4a0660', currentTheme)} />
            ) : (
              <MaterialCommunityIcons
                name="close"
                size={18}
                color={getThemeAwareColor('#4a0660', currentTheme)}
              />
            )}
          </TouchableOpacity>
        </View>
      )}

      <FileViewerModal
        visible={fileModalVisible}
        onClose={closeFileModal}
        filePath={selectedFile?.uri || ''}
        fileName={selectedFile?.name}
        onUpload={handleFileUpload}
        onImageUpload={handleImageUpload}
        useRag={useRagForUpload}
        onToggleRag={handleToggleRagForUpload}
        ragEnabled={ragEnabledForCurrentModel}
        ragToggleDisabled={ragToggleDisabled}
      />

      <CameraOverlay
        visible={cameraVisible}
        onClose={closeCamera}
        onPhotoTaken={handlePhotoTaken}
        useRag={useRagForUpload}
        onToggleRag={handleToggleRagForUpload}
        ragEnabled={ragEnabledForCurrentModel}
        ragToggleDisabled={ragToggleDisabled}
      />

      <Dialog
        visible={dialogVisible}
        onDismiss={hideDialog}
        title={dialogTitle}
        description={dialogMessage}
        buttonText="OK"
        onClose={hideDialog}
      />

      <AttachFallbackDialog
        visible={fallbackVisible}
        kind={fallbackAttach?.kind || 'unknown'}
        fileName={fallbackAttach?.name || 'file'}
        reason={
          fallbackReason === 'unsupported'
            ? 'unsupported'
            : 'needs-fallback'
        }
        onStt={fallbackBusy ? undefined : handleFallbackStt}
        onRemove={handleFallbackRemove}
        onDismiss={closeFallback}
      />

      <AITermsDialog
        visible={showAITermsDialog}
        onDismiss={() => setShowAITermsDialog(false)}
        onAccept={handleAcceptTerms}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 8,
  },
  wrapperCompact: {
    paddingBottom: 0,
    paddingTop: 4,
  },
  wrapperCompactAndroid: {
    paddingBottom: 0,
    paddingTop: 0,
    marginBottom: -20,
  },
  ragBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  ragBannerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  ragCancelButton: {
    marginLeft: 8,
    padding: 4,
    borderRadius: 12,
  },
  container: {
    position: 'relative',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachmentButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputContainer: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  glassCircle: {
    overflow: 'hidden',
  },
  input: {
    fontSize: 16,
    lineHeight: 20,
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentMenu: {
    position: 'absolute',
    bottom: 56,
    left: 0,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 16,
  },
  attachmentMenuItem: {
    alignItems: 'center',
    gap: 6,
  },
  attachmentMenuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentMenuText: {
    fontSize: 12,
    fontWeight: '500',
  },
  editingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  attachmentChip: {
    marginBottom: 8,
    width: '100%',
  },
  pendingFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  pendingFileIcon: {
    width: 36,
    height: 36,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  pendingFileTypeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  pendingFileInfo: {
    flex: 1,
    marginLeft: 4,
  },
  pendingFileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  pendingFileSubtitle: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  pendingFileClose: {
    padding: 4,
    marginLeft: 8,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ragStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 8,
    marginHorizontal: 4,
  },
  ragStatusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  ragStatusTextContainer: {
    flex: 1,
  },
  ragStatusTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  ragStatusSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  ragStatusRefresh: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
}); 
