import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  ActivityIndicator,
  Keyboard,
  Image,
  Modal,
  Dimensions,
  Alert,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ChatMarkdown from './ChatMarkdown';
import MarkdownBoundary from './MarkdownBoundary';
import SkillProgressPanel from './SkillProgressPanel';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import chatManager from '../../utils/ChatManager';
import { useRouter } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import type { SkillActivityStep } from '../../types/skillActivity';
import { ScrollViewMarker } from '../../services/adapters/NativeLayoutAdapter';

export type Message = {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  modelName?: string;
  thinking?: string;
  stats?: {
    duration: number;
    tokens: number;
    firstTokenTime?: number;
    avgTokenTime?: number;
  };
  isLoading?: boolean;
  skillSteps?: SkillActivityStep[];
};

type ChatViewProps = {
  messages: Message[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingMessage: string;
  streamingThinking: string;
  streamingStats: { tokens: number; duration: number; firstTokenTime?: number; avgTokenTime?: number } | null;
  skillSteps?: SkillActivityStep[];
  onCopyText: (text: string) => void;
  onRegenerateResponse: () => void;
  isRegenerating: boolean;
  justCancelled?: boolean;
  flatListRef: React.RefObject<FlatList | null>;
  onEditMessageAndRegenerate?: () => void;
  onStopGeneration?: () => void;
  onEditingStateChange?: (isEditing: boolean) => void;
  onStartEdit?: (messageId: string, content: string) => void;
  chatId?: string;
  onSwitchBranch?: (branchChatId: string) => void;
  onForkChat?: (fromMsgIndex: number) => void;
  bottomInset?: number;
  style?: StyleProp<ViewStyle>;
};

const hasMarkdownFormatting = (content: string): boolean => {
  const markdownPatterns = [
    /```/,
    /`[^`]+`/,
    /\*\*[^*]+\*\*/,
    /\*[^*]+\*/,
    /^#+\s/m,
    /\[[^\]]+\]\([^)]+\)/,
    /^\s*[-*+]\s/m,
    /^\s*\d+\.\s/m,
    /^\s*>\s/m,
    /~~[^~]+~~/,
    /\|\s*[^|]+\s*\|/,
    /\$\$[\s\S]+?\$\$/,
    /\$[^$\n]+\$/,
    /\\\[[\s\S]+?\\\]/,
    /\\\([\s\S]+?\\\)/,
  ];

  return markdownPatterns.some(pattern => pattern.test(content));
};

export default function ChatView({
  messages,
  isStreaming,
  streamingMessageId,
  streamingMessage,
  streamingThinking,
  streamingStats,
  skillSteps = [],
  onCopyText,
  onRegenerateResponse,
  isRegenerating,
  justCancelled = false,
  flatListRef,
  onEditMessageAndRegenerate,
  onStopGeneration,
  onEditingStateChange,
  onStartEdit,
  chatId,
  onSwitchBranch,
  onForkChat,
  bottomInset = 0,
  style,
}: ChatViewProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const router = useRouter();
  
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [imgViewSize, setImgViewSize] = useState<{ width: number; height: number } | null>(null);
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const branchSwitchRef = useRef(false);
  const branchSwitchTimer = useRef<NodeJS.Timeout | null>(null);
  const branchAnchorIdxRef = useRef<number | null>(null);
  const pendingAnchorRestoreRef = useRef(false);

  const glassOverflow = Platform.OS === 'ios' && bottomInset > 0;
  console.log('chat_glass', glassOverflow, bottomInset);

  const listContentStyle = useMemo(
    () => [
      styles.messageList,
      glassOverflow && { paddingTop: 16 + bottomInset },
    ],
    [glassOverflow, bottomInset],
  );

  const listScrollIndicatorInsets = useMemo(
    () => (glassOverflow ? { top: bottomInset, right: 1 } : { right: 1 }),
    [glassOverflow, bottomInset],
  );

  const markBranchSwitch = useCallback((origIndex: number) => {
    branchSwitchRef.current = true;
    branchAnchorIdxRef.current = origIndex;
    pendingAnchorRestoreRef.current = true;
    if (branchSwitchTimer.current) {
      clearTimeout(branchSwitchTimer.current);
    }
    branchSwitchTimer.current = setTimeout(() => {
      branchSwitchRef.current = false;
    }, 500);
  }, []);

  const branchInfoMap = useMemo(() => {
    if (!chatId) return new Map<number, { total: number; current: number; branches: string[] }>();
    return chatManager.getAllBranchInfo(chatId);
  }, [chatId, messages]);

  const forkInfoMap = useMemo(() => {
    if (!chatId) return new Map<number, { total: number; current: number; forks: string[] }>();
    return chatManager.getForkInfo(chatId);
  }, [chatId, messages]);

  const openReportDialog = useCallback((messageContent: string, provider: string) => {
    router.push({ pathname: '/report', params: { messageContent, provider } });
  }, [router]);

  const openImageViewer = useCallback((imageUri: string) => {
    setImgViewSize(null);
    setFullScreenImage(imageUri);
    setIsImageViewerVisible(true);
    Image.getSize(
      imageUri,
      (width, height) => {
        const vpWidth = Dimensions.get('window').width;
        const vpHeight = Dimensions.get('window').height;
        const scale = Math.min(1, vpWidth / width, vpHeight / height);
        setImgViewSize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
        });
      },
      () => {
        const vpWidth = Dimensions.get('window').width;
        const vpHeight = Dimensions.get('window').height;
        setImgViewSize({
          width: Math.round(vpWidth * 0.9),
          height: Math.round(vpHeight * 0.8),
        });
      }
    );
  }, []);

  const closeImageViewer = useCallback(() => {
    setIsImageViewerVisible(false);
    setFullScreenImage(null);
    setImgViewSize(null);
  }, []);

  const saveImg = useCallback(async () => {
    if (!fullScreenImage) {
      return;
    }

    try {
      let granted = mediaPermission?.granted;
      if (!granted) {
        const permissionResult = await requestMediaPermission();
        granted = permissionResult?.granted;
      }

      if (!granted) {
        Alert.alert('Permission Required', 'Allow photo library access to save images.');
        return;
      }

      await MediaLibrary.saveToLibraryAsync(fullScreenImage);
      Alert.alert('Saved', 'Image saved to your library.');
    } catch (e) {
      Alert.alert('Save Failed', 'Unable to save image to your library.');
    }
  }, [fullScreenImage, mediaPermission?.granted, requestMediaPermission]);

  const startEditing = useCallback((messageId: string, currentContent: string) => {
    let contentToEdit = currentContent;
    
    try {
      const parsedMessage = JSON.parse(currentContent);
      if (parsedMessage && parsedMessage.type === 'file_upload' && parsedMessage.userContent) {
        contentToEdit = parsedMessage.userContent;
      } else if (parsedMessage && parsedMessage.type === 'multimodal' && parsedMessage.content) {
        const textContent = parsedMessage.content.find((item: any) => item.type === 'text');
        contentToEdit = textContent ? textContent.text : '';
      } else if (parsedMessage && parsedMessage.type === 'ocr_result' && parsedMessage.userPrompt) {
        contentToEdit = parsedMessage.userPrompt;
      } else if (parsedMessage && parsedMessage.type === 'attachment') {
        contentToEdit = parsedMessage.userContent || '';
      }
    } catch (e) {
    }
    
    onStartEdit?.(messageId, contentToEdit);
    onEditingStateChange?.(true);
  }, [onStartEdit, onEditingStateChange]);

  const formatDuration = useCallback((seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  const formatTime = useCallback((milliseconds: number): string => {
    if (milliseconds < 1000) {
      return `${Math.round(milliseconds)}ms`;
    } else {
      const seconds = Math.floor(milliseconds / 1000);
      const remainingMs = Math.round(milliseconds % 1000);
      return `${seconds}.${remainingMs.toString().padStart(3, '0')}s`;
    }
  }, []);

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const origIndex = messages.length - 1 - index;
    const branchInfo = branchInfoMap.get(origIndex);
    const forkInfo = forkInfoMap.get(origIndex);
    const isCurrentlyStreaming = isStreaming && !justCancelled && item.id === streamingMessageId;
    const showLoadingIndicator = isCurrentlyStreaming && !streamingMessage && skillSteps.length === 0;
    const panelSteps = isCurrentlyStreaming ? skillSteps : (item.skillSteps || []);
    
    let fileAttachment: { name: string; type?: string } | null = null;
    let audioAttachment: { name: string } | null = null;
    let multimodalContent: { type: string; uri?: string; text?: string }[] = [];
    let generatedImage: { localUri?: string; url?: string; prompt?: string; revisedPrompt?: string } | null = null;
    
    const processContent = (content: string): string => {
      try {
        const parsedMessage = JSON.parse(content);
        
        if (parsedMessage && parsedMessage.type === 'multimodal' && parsedMessage.content) {
          multimodalContent = parsedMessage.content;
          const textContent = parsedMessage.content.find((item: any) => item.type === 'text');
          return textContent ? textContent.text : '';
        }
        
        if (parsedMessage && parsedMessage.type === 'ocr_result') {
          if (parsedMessage.imageUri) {
            multimodalContent = [
              {
                type: 'image',
                uri: parsedMessage.imageUri
              }
            ];
          }
          return parsedMessage.userPrompt || '';
        }

        if (parsedMessage && parsedMessage.type === 'image_generation') {
          generatedImage = {
            localUri: parsedMessage.localUri,
            url: parsedMessage.url,
            prompt: parsedMessage.prompt,
            revisedPrompt: parsedMessage.revisedPrompt,
          };
          return parsedMessage.revisedPrompt || parsedMessage.prompt || '';
        }

        if (parsedMessage && parsedMessage.type === 'audio_upload') {
          const rawName = typeof parsedMessage.fileName === 'string' && parsedMessage.fileName.trim()
            ? parsedMessage.fileName.trim()
            : (() => {
                const match = String(parsedMessage.internalInstruction || '').match(/Audio URI:\s*(.+)/);
                if (!match?.[1]) {
                  return 'Audio clip';
                }
                const cleaned = match[1].trim().replace(/^file:\/\//, '');
                const parts = cleaned.split('/');
                return parts[parts.length - 1] || 'Audio clip';
              })();

          audioAttachment = { name: rawName };
          return parsedMessage.userContent || '';
        }

        if (parsedMessage && parsedMessage.type === 'attachment' && Array.isArray(parsedMessage.attachments)) {
          console.log('chat_attach_render', parsedMessage.attachments.length);
          multimodalContent = parsedMessage.attachments
            .filter((item: any) => item.kind === 'image' || item.kind === 'audio')
            .map((item: any) => ({
              type: item.kind,
              uri: item.uri,
              text: item.textFallback?.text,
            }));
          const fileItem = parsedMessage.attachments.find(
            (item: any) => item.kind === 'pdf' || item.kind === 'document' || item.kind === 'unknown',
          );
          if (fileItem) {
            fileAttachment = {
              name: fileItem.name || 'uploaded file',
              type: (fileItem.name || '').split('.').pop()?.toLowerCase() || 'file',
            };
          }
          const audioItem = parsedMessage.attachments.find((item: any) => item.kind === 'audio');
          if (audioItem && !multimodalContent.some((m: any) => m.type === 'audio')) {
            audioAttachment = { name: audioItem.name || 'Audio clip' };
          }
          return parsedMessage.userContent || '';
        }
        
        if (parsedMessage && 
            parsedMessage.type === 'file_upload' && 
            parsedMessage.internalInstruction) {

          if (parsedMessage.metadata?.openaiFileId) {
            fileAttachment = {
              name: parsedMessage.fileName || 'uploaded file',
              type: parsedMessage.fileName?.split('.').pop()?.toLowerCase() || 'file',
            };
            return parsedMessage.userContent || '';
          }
          
          const match = parsedMessage.internalInstruction.match(/You're reading a file named: (.+?)\n/);
          if (match && match[1]) {
            fileAttachment = { 
              name: match[1],
              type: match[1].split('.').pop()?.toLowerCase() || 'txt'
            };
          }
          
          return parsedMessage.userContent || "";
        }

        if (parsedMessage &&
            parsedMessage.type === 'file_upload' &&
            parsedMessage.metadata?.remoteFileUri) {
          fileAttachment = {
            name: parsedMessage.fileName || 'uploaded file',
            type: parsedMessage.fileName?.split('.').pop()?.toLowerCase() || 'file',
          };
          return parsedMessage.userContent || '';
        }
      } catch (e) {
      }
      
      return content;
    };
    
    const extractThinkingFromContent = (content: string): { thinking: string; cleanContent: string } => {
      let thinking = '';
      let cleanContent = content;
      const parts: string[] = [];

      const completeThinkTagRegex = /<think>([\s\S]*?)<\/think>/gi;
      const completeMatches = content.match(completeThinkTagRegex);
      if (completeMatches && completeMatches.length > 0) {
        parts.push(
          ...completeMatches.map(match => match.replace(/<\/?think>/gi, '').trim()),
        );
        cleanContent = cleanContent.replace(completeThinkTagRegex, '').trim();
      }

      const channelRegex = /<\|channel>thought([\s\S]*?)<channel\|>/gi;
      const channelMatches = content.match(channelRegex);
      if (channelMatches && channelMatches.length > 0) {
        parts.push(
          ...channelMatches.map(match =>
            match.replace(/<\|channel>thought/gi, '').replace(/<channel\|>/gi, '').trim(),
          ),
        );
        cleanContent = cleanContent.replace(channelRegex, '').trim();
      }

      const incompleteThinkMatch = cleanContent.match(/<think>([\s\S]*?)$/i);
      if (incompleteThinkMatch && !cleanContent.includes('</think>')) {
        parts.push(incompleteThinkMatch[1].trim());
        cleanContent = cleanContent.replace(/<think>[\s\S]*?$/, '').trim();
      }

      const incompleteChannelMatch = cleanContent.match(/<\|channel>thought([\s\S]*?)$/i);
      if (incompleteChannelMatch && !cleanContent.includes('<channel|>')) {
        parts.push(incompleteChannelMatch[1].trim());
        cleanContent = cleanContent.replace(/<\|channel>thought[\s\S]*?$/, '').trim();
      }

      thinking = parts.filter(Boolean).join('\n\n');
      return { thinking, cleanContent: cleanContent.trim() };
    };

    const rawMessageContent = isCurrentlyStreaming 
      ? streamingMessage 
      : processContent(item.content);
    
    const { thinking: extractedThinking, cleanContent } = extractThinkingFromContent(rawMessageContent);
    const messageContent = cleanContent;

    const thinkingContent = isCurrentlyStreaming
      ? streamingThinking || extractedThinking
      : item.thinking || extractedThinking;

    const stats = isCurrentlyStreaming
      ? streamingStats
      : item.stats;
      
    const renderFileAttachment = () => {
      if (!fileAttachment) return null;
      
      const getFileTypeColor = (type?: string): string => {
        if (!type) return '#aaaaaa';
        
        switch(type.toLowerCase()) {
          case 'pdf': return '#FF5252';
          case 'doc': case 'docx': return '#2196F3';
          case 'xls': case 'xlsx': return '#4CAF50';
          case 'ppt': case 'pptx': return '#FF9800';
          case 'jpg': case 'jpeg': case 'png': case 'gif': return '#9C27B0';
          case 'zip': case 'rar': case '7z': return '#795548';
          case 'js': case 'ts': return '#FFC107';
          case 'py': return '#3F51B5';
          case 'html': case 'css': return '#FF5722';
          default: return '#9E9E9E';
        }
      };
      
      const fileTypeBgColor = getFileTypeColor(fileAttachment.type);
      const fileTypeDisplay = fileAttachment.type ? 
        (fileAttachment.type.length > 4 ? fileAttachment.type.substring(0, 4) : fileAttachment.type).toUpperCase() 
        : 'FILE';
      
      return (
        <View style={[styles.fileAttachmentWrapper]}>
          <View style={[styles.fileAttachment, { backgroundColor: themeColors.borderColor }]}>
            <View style={[styles.fileTypeIcon, { backgroundColor: fileTypeBgColor }]}>
              <Text style={styles.fileTypeText}>{fileTypeDisplay}</Text>
            </View>
            <View style={styles.fileAttachmentContent}>
              <Text style={[styles.fileAttachmentName, { color: themeColors.text }]} numberOfLines={1} ellipsizeMode="middle">
                {fileAttachment.name || ''}
              </Text>
              <Text style={[styles.fileAttachmentType, { color: themeColors.secondaryText }]}>
                File attachment
              </Text>
            </View>
          </View>
        </View>
      );
    };

    const renderMultimodalContent = () => {
      if (!multimodalContent.length) return null;
      
      const mediaItems = multimodalContent.filter(item => item.type === 'image' || item.type === 'audio');
      if (!mediaItems.length) return null;
      
      return (
        <View style={[styles.multimodalWrapper]}>
          {mediaItems.map((item, index) => {
            if (item.type === 'image' && item.uri) {
              return (
                <TouchableOpacity 
                  key={index} 
                  style={styles.imageContainer}
                  onPress={() => openImageViewer(item.uri!)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.messageImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              );
            } else if (item.type === 'audio' && item.uri) {
              return (
                <View key={index} style={[styles.audioContainer, { backgroundColor: themeColors.borderColor }]}>
                  <MaterialCommunityIcons 
                    name="volume-high" 
                    size={24} 
                    color={themeColors.text} 
                  />
                  <Text style={[styles.audioLabel, { color: themeColors.text }]}>
                    Audio Recording
                  </Text>
                </View>
              );
            }
            return null;
          })}
        </View>
      );
    };

    const renderAudioAttachment = () => {
      if (!audioAttachment) return null;

      return (
        <View style={styles.fileAttachmentWrapper}>
          <View style={[styles.fileAttachment, { backgroundColor: themeColors.borderColor }]}> 
            <View style={[styles.fileTypeIcon, { backgroundColor: '#f39c12' }]}> 
              <MaterialCommunityIcons name="file-music-outline" size={16} color="#ffffff" />
            </View>
            <View style={styles.fileAttachmentContent}>
              <Text style={[styles.fileAttachmentName, { color: themeColors.text }]} numberOfLines={1} ellipsizeMode="middle">
                {audioAttachment.name}
              </Text>
              <Text style={[styles.fileAttachmentType, { color: themeColors.secondaryText }]}>Audio attachment</Text>
            </View>
          </View>
        </View>
      );
    };

    const renderGeneratedImage = () => {
      if (!generatedImage) return null;
      const imageUri = generatedImage.localUri || generatedImage.url;
      if (!imageUri) return null;

      return (
        <View style={styles.multimodalWrapper}>
          <TouchableOpacity
            style={styles.imageContainer}
            onPress={() => openImageViewer(imageUri)}
            activeOpacity={0.8}
          >
            <Image
              source={{ uri: imageUri }}
              style={styles.messageImage}
              resizeMode="cover"
            />
          </TouchableOpacity>
        </View>
      );
    };
    
    return (
      <View style={styles.messageContainer}>
        {item.role === 'assistant' && thinkingContent ? (
          <View key="thinking" style={[
            styles.thinkingBubble,
            { 
              backgroundColor: themeColors.borderColor,
              borderColor: themeColors.primary,
              borderLeftColor: themeColors.primary,
            }
          ]}>
            <View style={styles.thinkingHeader}>
              <View style={styles.thinkingTitleRow}>
                <MaterialCommunityIcons 
                  name="brain" 
                  size={18} 
                  color={themeColors.primary}
                  style={styles.thinkingIcon}
                />
                <Text style={[styles.thinkingLabel, { color: themeColors.primary }]}>
                  Reasoning
                </Text>
              </View>
              <TouchableOpacity 
                style={[styles.thinkingCopyButton, { backgroundColor: themeColors.primary }]} 
                onPress={() => onCopyText(thinkingContent)}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <MaterialCommunityIcons 
                  name="content-copy" 
                  size={14} 
                  color="#ffffff" 
                />
              </TouchableOpacity>
            </View>
            <Text 
              style={[styles.thinkingText, { color: themeColors.text }]} 
              selectable={true}
            >
              {thinkingContent || ''}
            </Text>
          </View>
        ) : null}
        
        {item.role === 'user' && fileAttachment ? renderFileAttachment() : null}
        {item.role === 'user' && audioAttachment ? renderAudioAttachment() : null}
        {item.role === 'user' && multimodalContent.length > 0 ? renderMultimodalContent() : null}
        {item.role === 'assistant' && generatedImage ? renderGeneratedImage() : null}

        <View style={[
          styles.messageCard,
          { 
            backgroundColor: item.role === 'user' ? themeColors.headerBackground : themeColors.borderColor,
            alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
            borderTopRightRadius: item.role === 'user' ? 4 : 20,
            borderTopLeftRadius: item.role === 'user' ? 20 : 4,
            width: item.role === 'assistant' ? '90%' : undefined,
          }
        ]}>
          <View style={styles.messageHeader}>
            <Text style={[styles.roleLabel, { color: item.role === 'user' ? '#fff' : themeColors.text }]}>
              {item.role === 'user' ? 'You' : (item.modelName || 'Model')}
            </Text>
            <View style={styles.messageHeaderActions}>
              {item.role === 'user' ? (
                <TouchableOpacity 
                  style={styles.copyButton} 
                  onPress={() => startEditing(item.id, item.content)}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                >
                  <MaterialCommunityIcons 
                    name="pencil" 
                    size={16} 
                    color="#fff" 
                  />
                </TouchableOpacity>
              ) : null}
              {item.role === 'assistant' ? (
                <TouchableOpacity 
                  style={styles.copyButton} 
                  onPress={() => onForkChat?.(origIndex)}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                >
                  <MaterialCommunityIcons 
                    name="source-branch" 
                    size={16} 
                    color={themeColors.text} 
                  />
                </TouchableOpacity>
              ) : null}
              {item.role === 'assistant' ? (
                <TouchableOpacity 
                  style={styles.copyButton} 
                  onPress={() => openReportDialog(messageContent, chatManager.getCurrentProvider() || 'local')}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                >
                  <MaterialCommunityIcons 
                    name="flag-outline" 
                    size={16} 
                    color={themeColors.text} 
                  />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity 
                style={styles.copyButton} 
                onPress={() => onCopyText(messageContent)}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <MaterialCommunityIcons 
                  name="content-copy" 
                  size={16} 
                  color={item.role === 'user' ? '#fff' : themeColors.text} 
                />
              </TouchableOpacity>
            </View>
          </View>

          {item.role === 'assistant' && panelSteps.length > 0 ? (
            <SkillProgressPanel steps={panelSteps} />
          ) : null}

          {showLoadingIndicator ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator 
                size="small" 
                color={themeColors.secondaryText} 
              />
              <Text style={[styles.loadingText, { color: themeColors.secondaryText }]}>
                Generating response...
              </Text>
            </View>
          ) : !hasMarkdownFormatting(messageContent) ? (
            messageContent && messageContent.trim() ? (
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
            ) : item.role === 'user' && (fileAttachment || audioAttachment) ? null : (
              <View style={styles.messageContent}>
                <Text 
                  style={[
                    styles.messageText,
                    { color: item.role === 'user' ? '#fff' : themeColors.text, fontStyle: 'italic', opacity: 0.7 }
                  ]}
                >
                  {item.role === 'user' 
                    ? 'Sent a file' 
                    : (thinkingContent ? 'Thinking...' : 'Empty message')
                  }
                </Text>
              </View>
            )
          ) : (
            <View style={styles.markdownWrapper}>
              <MarkdownBoundary
                fallbackContent={messageContent}
                textColor={item.role === 'user' ? '#fff' : themeColors.text}
              >
                <ChatMarkdown
                  content={messageContent}
                  isStreaming={isCurrentlyStreaming}
                  textColor={item.role === 'user' ? '#fff' : themeColors.text}
                  codeHeaderColor={themeColors.headerText}
                  onCopyCode={onCopyText}
                />
              </MarkdownBoundary>
            </View>
          )}

          {item.role === 'assistant' && stats ? (() => {
            const isReasoning = isCurrentlyStreaming && (stats?.tokens ?? 0) === 0;
            return (
            <View style={styles.statsContainer}>
              <View style={styles.statsRow}>
                {!isReasoning ? (
                  <View style={styles.statItem}>
                    <MaterialCommunityIcons 
                      name="text-box-outline" 
                      size={12} 
                      color={themeColors.secondaryText}
                      style={styles.statIcon}
                    />
                    <Text style={[styles.statsText, { color: themeColors.secondaryText }]}>
                      {`${(stats?.tokens ?? 0).toLocaleString()} tokens`}
                    </Text>
                  </View>
                ) : null}
                {!isReasoning && stats?.duration && stats.duration > 0 ? (
                  <View style={[styles.statItem, { marginLeft: 8 }]}>
                    <MaterialCommunityIcons 
                      name="speedometer" 
                      size={12} 
                      color={themeColors.secondaryText}
                      style={styles.statIcon}
                    />
                    <Text style={[styles.statsText, { color: themeColors.secondaryText }]}> 
                      {`${((stats?.tokens ?? 0) / stats.duration).toFixed(1)} tokens/s`}
                    </Text>
                  </View>
                ) : null}
                {stats?.duration && stats.duration > 0 ? (
                  <View style={[styles.statItem, !isReasoning ? { marginLeft: 8 } : undefined]}>
                    <MaterialCommunityIcons 
                      name="clock-outline" 
                      size={12} 
                      color={themeColors.secondaryText}
                      style={styles.statIcon}
                    />
                    <Text style={[styles.statsText, { color: themeColors.secondaryText }]}> 
                      {formatDuration(stats.duration)}
                    </Text>
                  </View>
                ) : null}
              </View>
              
              {!isReasoning ? (
              <View style={styles.statsRow}>
                {stats?.firstTokenTime && stats.firstTokenTime > 0 ? (
                  <View style={styles.statItem}>
                    <MaterialCommunityIcons 
                      name="flash" 
                      size={12} 
                      color={themeColors.secondaryText}
                      style={styles.statIcon}
                    />
                    <Text style={[styles.statsText, { color: themeColors.secondaryText }]}> 
                      TTFT: {formatTime(stats.firstTokenTime)}
                    </Text>
                  </View>
                ) : isCurrentlyStreaming ? (
                  <View style={styles.statItem}>
                    <MaterialCommunityIcons 
                      name="flash" 
                      size={12} 
                      color={themeColors.secondaryText}
                      style={styles.statIcon}
                    />
                    <Text style={[styles.statsText, { color: themeColors.secondaryText }]}> 
                      TTFT: --
                    </Text>
                  </View>
                ) : null}
                {stats?.avgTokenTime && stats.avgTokenTime > 0 ? (
                  <View style={[styles.statItem, { marginLeft: 8 }]}>
                    <MaterialCommunityIcons 
                      name="timer-outline" 
                      size={12} 
                      color={themeColors.secondaryText}
                      style={styles.statIcon}
                    />
                    <Text style={[styles.statsText, { color: themeColors.secondaryText }]}> 
                      Avg/tok: {formatTime(stats.avgTokenTime)}
                    </Text>
                  </View>
                ) : isCurrentlyStreaming ? (
                  <View style={[styles.statItem, { marginLeft: 8 }]}>
                    <MaterialCommunityIcons 
                      name="timer-outline" 
                      size={12} 
                      color={themeColors.secondaryText}
                      style={styles.statIcon}
                    />
                    <Text style={[styles.statsText, { color: themeColors.secondaryText }]}> 
                      Avg/tok: --
                    </Text>
                  </View>
                ) : null}
                {item === messages[messages.length - 1] && !isCurrentlyStreaming ? (
                  <View style={{ flex: 1 }} />
                ) : null}
                {item === messages[messages.length - 1] && !isCurrentlyStreaming ? (
                  <TouchableOpacity
                    style={[
                      styles.regenerateButton,
                      isRegenerating && styles.regenerateButtonDisabled
                    ]}
                    onPress={() => {
                      if (!isRegenerating) {
                        onRegenerateResponse();
                      }
                    }}
                    disabled={isRegenerating}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  >
                    {isRegenerating ? (
                      <ActivityIndicator size="small" color={themeColors.secondaryText} />
                    ) : (
                      <MaterialCommunityIcons
                        name="refresh"
                        size={17}
                        color={themeColors.secondaryText}
                      />
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
              ) : null}
            </View>
            );
          })() : null}

          {item.role === 'assistant' && !stats && item === messages[messages.length - 1] && !isCurrentlyStreaming ? (
            <View style={styles.regenerateRow}>
              <TouchableOpacity
                style={[
                  styles.regenerateButton,
                  isRegenerating && styles.regenerateButtonDisabled
                ]}
                onPress={() => {
                  if (!isRegenerating) {
                    onRegenerateResponse();
                  }
                }}
                disabled={isRegenerating}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                {isRegenerating ? (
                  <ActivityIndicator size="small" color={themeColors.secondaryText} />
                ) : (
                  <MaterialCommunityIcons
                    name="refresh"
                    size={20}
                    color={themeColors.secondaryText}
                  />
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {item.role === 'user' && branchInfo && branchInfo.total > 1 ? (
          <View style={[styles.branchNav, { alignSelf: 'flex-end' }]}>
            <TouchableOpacity
              onPress={() => {
                const prevIdx = (branchInfo.current - 1 + branchInfo.total) % branchInfo.total;
                markBranchSwitch(origIndex);
                onSwitchBranch?.(branchInfo.branches[prevIdx]);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.branchNavBtn}
            >
              <MaterialCommunityIcons name="chevron-left" size={18} color={themeColors.secondaryText} />
            </TouchableOpacity>
            <Text style={[styles.branchNavText, { color: themeColors.secondaryText }]}>
              {branchInfo.current + 1}/{branchInfo.total}
            </Text>
            <TouchableOpacity
              onPress={() => {
                const nextIdx = (branchInfo.current + 1) % branchInfo.total;
                markBranchSwitch(origIndex);
                onSwitchBranch?.(branchInfo.branches[nextIdx]);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.branchNavBtn}
            >
              <MaterialCommunityIcons name="chevron-right" size={18} color={themeColors.secondaryText} />
            </TouchableOpacity>
          </View>
        ) : null}

        {item.role === 'assistant' && forkInfo && forkInfo.total > 1 ? (
          <View style={[styles.branchNav, { alignSelf: 'flex-start' }]}>
            <TouchableOpacity
              onPress={() => {
                const prevIdx = (forkInfo.current - 1 + forkInfo.total) % forkInfo.total;
                markBranchSwitch(origIndex);
                onSwitchBranch?.(forkInfo.forks[prevIdx]);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.branchNavBtn}
            >
              <MaterialCommunityIcons name="chevron-left" size={18} color={themeColors.secondaryText} />
            </TouchableOpacity>
            <Text style={[styles.branchNavText, { color: themeColors.secondaryText }]}>
              {forkInfo.current + 1}/{forkInfo.total}
            </Text>
            <TouchableOpacity
              onPress={() => {
                const nextIdx = (forkInfo.current + 1) % forkInfo.total;
                markBranchSwitch(origIndex);
                onSwitchBranch?.(forkInfo.forks[nextIdx]);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.branchNavBtn}
            >
              <MaterialCommunityIcons name="chevron-right" size={18} color={themeColors.secondaryText} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  }, [themeColors, messages, isStreaming, streamingMessageId, streamingMessage, streamingThinking, streamingStats, skillSteps, onCopyText, isRegenerating, onRegenerateResponse, justCancelled, openImageViewer, startEditing, formatTime, formatDuration, branchInfoMap, forkInfoMap, onSwitchBranch, onForkChat]);

  const renderContent = () => {
    if (messages.length === 0) {
      return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.emptyState}>
            <MaterialCommunityIcons 
              name="message-text-outline" 
              size={48} 
              color={currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.75)'} 
            />
            <Text style={[{ color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.75)' }]}>
              Select a model and start chatting
            </Text>
          </View>
        </TouchableWithoutFeedback>
      );
    }

    const list = (
      <FlatList
        ref={flatListRef}
        style={glassOverflow ? styles.listGlass : styles.list}
        data={[...messages].reverse()}
        renderItem={renderMessage}
        keyExtractor={(_item: Message, idx: number) => `msg-${idx}`}
        extraData={chatId}
        contentContainerStyle={listContentStyle}
        contentInsetAdjustmentBehavior={glassOverflow ? 'never' : 'automatic'}
        inverted={true}
        maintainVisibleContentPosition={
          branchSwitchRef.current
            ? { minIndexForVisible: 0 }
            : { minIndexForVisible: 0, autoscrollToTopThreshold: 10 }
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={true}
        initialNumToRender={15}
        removeClippedSubviews={false}
        windowSize={10}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        onEndReachedThreshold={0.5}
        scrollIndicatorInsets={listScrollIndicatorInsets}
        onTouchStart={Keyboard.dismiss}
        onContentSizeChange={() => {
          if (!pendingAnchorRestoreRef.current) {
            return;
          }
          const anchorOrigIndex = branchAnchorIdxRef.current;
          if (anchorOrigIndex === null || messages.length === 0 || !flatListRef.current) {
            return;
          }
          const targetIndex = Math.max(
            0,
            Math.min(messages.length - 1, messages.length - 1 - anchorOrigIndex)
          );
          try {
            flatListRef.current.scrollToIndex({
              index: targetIndex,
              animated: false,
              viewPosition: 0.5,
            });
            pendingAnchorRestoreRef.current = false;
          } catch (error) {
          }
        }}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          if (!flatListRef.current) {
            return;
          }
          flatListRef.current.scrollToOffset({
            offset: Math.max(0, averageItemLength * index),
            animated: false,
          });
          setTimeout(() => {
            const anchorOrigIndex = branchAnchorIdxRef.current;
            if (anchorOrigIndex === null || messages.length === 0 || !flatListRef.current) {
              return;
            }
            const targetIndex = Math.max(
              0,
              Math.min(messages.length - 1, messages.length - 1 - anchorOrigIndex)
            );
            flatListRef.current.scrollToIndex({
              index: targetIndex,
              animated: false,
              viewPosition: 0.5,
            });
            pendingAnchorRestoreRef.current = false;
          }, 32);
        }}
      />
    );

    if (!glassOverflow) {
      return list;
    }

    return (
      <ScrollViewMarker
        style={styles.list}
        scrollEdgeEffects={{ bottom: 'hidden' }}
      >
        {list}
      </ScrollViewMarker>
    );
  };

  return (
    <View
      style={[styles.container, glassOverflow && styles.containerGlass, style]}
      collapsable={glassOverflow ? false : undefined}
    >
      {renderContent()}
      
      <Modal
        visible={isImageViewerVisible}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={closeImageViewer}
      >
        <View style={styles.imageViewerModal}>
          <TouchableWithoutFeedback onPress={closeImageViewer}>
            <View style={styles.imageViewerBackdrop} />
          </TouchableWithoutFeedback>
          
          <View style={styles.imageViewerContent}>
            <View style={styles.imageViewerHeader}>
              <TouchableOpacity
                style={[styles.imageViewerButton, styles.closeButton]}
                onPress={closeImageViewer}
              >
                <MaterialCommunityIcons 
                  name="close" 
                  size={24} 
                  color="#fff" 
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.imageViewerButton, styles.saveButton]}
                onPress={saveImg}
              >
                <MaterialCommunityIcons
                  name="content-save-outline"
                  size={22}
                  color="#fff"
                />
              </TouchableOpacity>
            </View>
            
            {fullScreenImage ? (
              <Image
                source={{ uri: fullScreenImage }}
                style={[
                  styles.fullScreenImage,
                  imgViewSize
                    ? { width: imgViewSize.width, height: imgViewSize.height }
                    : { width: Math.round(Dimensions.get('window').width * 0.9), height: Math.round(Dimensions.get('window').height * 0.8) }
                ]}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  list: {
    flex: 1,
  },
  listGlass: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  messageList: {
    flexGrow: 1,
    paddingTop: 16,
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  messageContainer: {
    marginVertical: 4,
    width: '100%',
    paddingHorizontal: 8,
  },
  messageCard: {
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
  messageHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    flexDirection: 'column',
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    overflow: 'visible',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  statsText: {
    fontSize: 11,
    opacity: 0.7,
  },
  regenerateRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
  },
  regenerateButton: {
    padding: 4,
    borderRadius: 4,
    opacity: 0.8,
  },
  regenerateButtonDisabled: {
    opacity: 0.5,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  thinkingBubble: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderLeftWidth: 4,
    borderRadius: 12,
    marginBottom: 8,
    padding: 16,
    width: '90%',
    alignSelf: 'flex-start'
  },
  thinkingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  thinkingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  thinkingIcon: {
    marginRight: 8,
  },
  thinkingLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginRight: 8,
  },
  thinkingBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 24,
    alignItems: 'center',
  },
  thinkingBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  thinkingCopyButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thinkingText: {
    fontSize: 14,
    lineHeight: 22,
    fontStyle: 'italic',
    opacity: 0.9,
  },
  loadingContainer: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  fileAttachmentWrapper: {
    marginBottom: 8,
    width: '100%',
  },
  fileAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  fileAttachmentContent: {
    marginLeft: 12,
    flex: 1,
  },
  fileAttachmentName: {
    fontSize: 14,
    fontWeight: '600',
  },
  fileAttachmentType: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  fileTypeIcon: {
    width: 36,
    height: 36,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  fileTypeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  multimodalWrapper: {
    marginBottom: 8,
    width: '100%',
  },
  imageContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  messageImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  audioLabel: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  imageViewerModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  imageViewerContent: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 1,
  },
  imageViewerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  saveButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  fullScreenImage: {
    maxWidth: '100%',
    maxHeight: '100%',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statIcon: {
    marginRight: 4,
  },
  branchNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 2,
  },
  branchNavBtn: {
    padding: 4,
  },
  branchNavText: {
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 4,
  },
}); 