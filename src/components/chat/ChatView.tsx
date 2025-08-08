import React, { useCallback, useState } from 'react';
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
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { Dialog, Portal, Button } from 'react-native-paper';
import chatManager from '../../utils/ChatManager';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';

export type Message = {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  thinking?: string;
  stats?: {
    duration: number;
    tokens: number;
    firstTokenTime?: number;
    avgTokenTime?: number;
  };
  isLoading?: boolean;
};

type ChatViewProps = {
  messages: Message[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingMessage: string;
  streamingThinking: string;
  streamingStats: { tokens: number; duration: number; firstTokenTime?: number; avgTokenTime?: number } | null;
  onCopyText: (text: string) => void;
  onRegenerateResponse: () => void;
  isRegenerating: boolean;
  justCancelled?: boolean;
  flatListRef: React.RefObject<FlatList | null>;
  onEditMessageAndRegenerate?: () => void;
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
    /\|\s*[^|]+\s*\|/  
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
  onCopyText,
  onRegenerateResponse,
  isRegenerating,
  justCancelled = false,
  flatListRef,
  onEditMessageAndRegenerate,
}: ChatViewProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedMessageContent, setEditedMessageContent] = useState('');

  const openReportDialog = useCallback((messageContent: string, provider: string) => {
    navigation.navigate('Report', {
      messageContent,
      provider
    });
  }, [navigation]);

  const closeReportDialog = useCallback(() => {
    // No longer needed since we're using navigation
  }, []);

  const openImageViewer = useCallback((imageUri: string) => {
    setFullScreenImage(imageUri);
    setIsImageViewerVisible(true);
  }, []);

  const closeImageViewer = useCallback(() => {
    setIsImageViewerVisible(false);
    setFullScreenImage(null);
  }, []);

  const openEditDialog = useCallback((messageId: string, currentContent: string) => {
    let contentToEdit = currentContent;
    
    try {
      const parsedMessage = JSON.parse(currentContent);
      if (parsedMessage && parsedMessage.type === 'file_upload' && parsedMessage.userContent) {
        contentToEdit = parsedMessage.userContent;
      }
    } catch (e) {
      // Not JSON, use as is
    }
    
    setEditingMessageId(messageId);
    setEditedMessageContent(contentToEdit);
  }, []);

  const closeEditDialog = useCallback(() => {
    setEditingMessageId(null);
    setEditedMessageContent('');
  }, []);

  const saveEditedMessage = useCallback(async () => {
    if (!editingMessageId || !editedMessageContent.trim()) {
      closeEditDialog();
      return;
    }

    try {
      const success = await chatManager.editMessage(editingMessageId, editedMessageContent.trim());
      
      if (success) {
        closeEditDialog();
        if (onEditMessageAndRegenerate) {
          onEditMessageAndRegenerate();
        }
      } else {
        Alert.alert('Error', 'Failed to edit message');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to edit message');
    }
  }, [editingMessageId, editedMessageContent, closeEditDialog, onEditMessageAndRegenerate]);

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

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isCurrentlyStreaming = (isStreaming || justCancelled) && item.id === streamingMessageId;
    const showLoadingIndicator = isCurrentlyStreaming && !streamingMessage && !justCancelled;
    
    let fileAttachment: { name: string; type?: string } | null = null;
    let multimodalContent: { type: string; uri?: string; text?: string }[] = [];
    
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
        
        if (parsedMessage && 
            parsedMessage.type === 'file_upload' && 
            parsedMessage.internalInstruction) {
          
          const match = parsedMessage.internalInstruction.match(/You're reading a file named: (.+?)\n/);
          if (match && match[1]) {
            fileAttachment = { 
              name: match[1],
              type: match[1].split('.').pop()?.toLowerCase() || 'txt'
            };
          }
          
          return parsedMessage.userContent || "";
        }
      } catch (e) {
        // Not JSON
      }
      
      return content;
    };
    
    const messageContent = isCurrentlyStreaming 
      ? streamingMessage 
      : processContent(item.content);
      
    const thinkingContent = isCurrentlyStreaming
      ? streamingThinking
      : item.thinking;

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
    
    return (
      <View style={styles.messageContainer}>
        {item.role === 'assistant' && thinkingContent && (
          <View key="thinking" style={styles.thinkingContainer}>
            <View style={styles.thinkingHeader}>
              <MaterialCommunityIcons 
                name="lightbulb-outline" 
                size={14} 
                color={themeColors.secondaryText}
                style={styles.thinkingIcon}
              />
              <Text style={[styles.thinkingLabel, { color: themeColors.secondaryText }]}>
                Reasoning
              </Text>
              <TouchableOpacity 
                style={styles.copyButton} 
                onPress={() => onCopyText(thinkingContent)}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <MaterialCommunityIcons 
                  name="content-copy" 
                  size={14} 
                  color={themeColors.secondaryText} 
                />
              </TouchableOpacity>
            </View>
            <Text 
              style={[styles.thinkingText, { color: themeColors.secondaryText }]} 
              selectable={true}
            >
              {thinkingContent || ''}
            </Text>
          </View>
        )}
        
        {item.role === 'user' && fileAttachment && renderFileAttachment()}
        {item.role === 'user' && multimodalContent.length > 0 && renderMultimodalContent()}

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
              {item.role === 'user' ? 'You' : 'Model'}
            </Text>
            <View style={styles.messageHeaderActions}>
              {item.role === 'user' && (
                <TouchableOpacity 
                  style={styles.copyButton} 
                  onPress={() => openEditDialog(item.id, item.content)}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                >
                  <MaterialCommunityIcons 
                    name="pencil" 
                    size={16} 
                    color="#fff" 
                  />
                </TouchableOpacity>
              )}
              {item.role === 'assistant' && (
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
              )}
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
            ) : item.role === 'user' && fileAttachment ? null : (
              <View style={styles.messageContent}>
                <Text 
                  style={[
                    styles.messageText,
                    { color: item.role === 'user' ? '#fff' : themeColors.text, fontStyle: 'italic', opacity: 0.7 }
                  ]}
                >
                  {item.role === 'user' ? 'Sent a file' : 'Empty message'}
                </Text>
              </View>
            )
          ) : (
            <View style={styles.markdownWrapper}>
              <Markdown
                style={{
                  body: {
                    color: item.role === 'user' ? '#fff' : themeColors.text,
                    fontSize: 15,
                    lineHeight: 20,
                  },
                  paragraph: {
                    marginVertical: 0,
                  },
                  heading1: {
                    fontSize: 18,
                    lineHeight: 24,
                    fontWeight: '600',
                    marginVertical: 8,
                  },
                  heading2: {
                    fontSize: 17,
                    lineHeight: 22,
                    fontWeight: '600',
                    marginVertical: 8,
                  },
                  heading3: {
                    fontSize: 16,
                    lineHeight: 20,
                    fontWeight: '600',
                    marginVertical: 8,
                  },
                  heading4: {
                    fontSize: 15,
                    lineHeight: 20,
                    fontWeight: '600',
                    marginVertical: 8,
                  },
                  heading5: {
                    fontSize: 15,
                    lineHeight: 20,
                    fontWeight: '600',
                    marginVertical: 8,
                  },
                  heading6: {
                    fontSize: 15,
                    lineHeight: 20,
                    fontWeight: '600',
                    marginVertical: 8,
                  },
                  code_block: {
                    backgroundColor: '#000',
                    borderRadius: 8,
                    padding: 12,
                    marginVertical: 8,
                    position: 'relative',
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                    fontSize: 14,
                    lineHeight: 20,
                  },
                  fence: {
                    backgroundColor: '#000',
                    borderRadius: 8,
                    padding: 12,
                    marginVertical: 8,
                    position: 'relative',
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                    fontSize: 14,
                    lineHeight: 20,
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
                    fontSize: 15,
                    lineHeight: 20,
                  },
                  fence_text: {
                    color: '#fff',
                    fontSize: 14,
                    lineHeight: 20,
                  },
                  code_block_text: {
                    color: '#fff',
                    fontSize: 14,
                    lineHeight: 20,
                  },
                  list_item: {
                    marginVertical: 4,
                  },
                  bullet_list: {
                    marginVertical: 8,
                  },
                  ordered_list: {
                    marginVertical: 8,
                  }
                }}
                rules={{
                  fence: (node, children, parent, styles) => {
                    const codeContent = node.content;
                    return (
                      <View style={[styles.fence, { position: 'relative' }]} key={node.key}>
                        <Text style={styles.fence_text} selectable={true}>
                          {codeContent || ''}
                        </Text>
                        <TouchableOpacity 
                          style={styles.codeBlockCopyButton}
                          onPress={() => onCopyText(codeContent)}
                          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                        >
                          <MaterialCommunityIcons 
                            name="content-copy" 
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
                          {codeContent || ''}
                        </Text>
                        <TouchableOpacity 
                          style={styles.codeBlockCopyButton}
                          onPress={() => onCopyText(codeContent)}
                          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                        >
                          <MaterialCommunityIcons 
                            name="content-copy" 
                            size={14} 
                            color={themeColors.headerText} 
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  }
                }}
              >
                {messageContent && messageContent.trim() ? messageContent : ''}
              </Markdown>
            </View>
          )}

          {item.role === 'assistant' && stats && (
            <View style={styles.statsContainer}>
              <View style={styles.statsRow}>
                <Text style={[styles.statsText, { color: themeColors.secondaryText }]}>
                  {`${(stats?.tokens ?? 0).toLocaleString()} tokens`}
                </Text>
                {stats?.duration && stats.duration > 0 && (
                  <Text style={[styles.statsText, { color: themeColors.secondaryText, marginLeft: 8 }]}> 
                    {`${((stats?.tokens ?? 0) / stats.duration).toFixed(1)} tok/s`}
                  </Text>
                )}
                {stats?.duration && stats.duration > 0 && (
                  <Text style={[styles.statsText, { color: themeColors.secondaryText, marginLeft: 8 }]}> 
                    {formatDuration(stats.duration)}
                  </Text>
                )}
              </View>
              
              <View style={styles.statsRow}>
                {stats?.firstTokenTime && stats.firstTokenTime > 0 && (
                  <Text style={[styles.statsText, { color: themeColors.secondaryText }]}> 
                    TTFT: {formatTime(stats.firstTokenTime)}
                  </Text>
                )}
                {stats?.avgTokenTime && stats.avgTokenTime > 0 && (
                  <Text style={[styles.statsText, { color: themeColors.secondaryText, marginLeft: 8 }]}> 
                    Avg: {formatTime(stats.avgTokenTime)}
                  </Text>
                )}
                
                {item === messages[messages.length - 1] && (
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
                  >
                    {isRegenerating ? (
                      <ActivityIndicator size="small" color={themeColors.secondaryText} />
                    ) : (
                      <>
                        <MaterialCommunityIcons 
                          name="refresh" 
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
            </View>
          )}
        </View>
      </View>
    );
  }, [themeColors, messages, isStreaming, streamingMessageId, streamingMessage, streamingThinking, streamingStats, onCopyText, isRegenerating, onRegenerateResponse, justCancelled, openImageViewer, openEditDialog, formatTime, formatDuration]);

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

    return (
      <FlatList
        ref={flatListRef}
        data={[...messages].reverse()}
        renderItem={renderMessage}
        keyExtractor={(item: Message) => item.id}
        contentContainerStyle={styles.messageList}
        inverted={true}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
          autoscrollToTopThreshold: 10,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={true}
        initialNumToRender={15}
        removeClippedSubviews={Platform.OS === 'android'}
        windowSize={10}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        onEndReachedThreshold={0.5}
        scrollIndicatorInsets={{ right: 1 }}
        onTouchStart={Keyboard.dismiss}
        onLayout={() => {
          if (flatListRef.current && messages.length > 0) {
            flatListRef.current.scrollToOffset({ offset: 0, animated: false });
          }
        }}
      />
    );
  };

  return (
    <View style={styles.container}>
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
            </View>
            
            {fullScreenImage && (
              <Image
                source={{ uri: fullScreenImage }}
                style={styles.fullScreenImage}
                resizeMode="contain"
              />
            )}
          </View>
        </View>
      </Modal>

      <Portal>
        <Dialog 
          visible={editingMessageId !== null} 
          onDismiss={closeEditDialog}
          style={{ backgroundColor: themeColors.background }}
        >
          <Dialog.Title style={{ color: themeColors.text }}>
            Edit Message
          </Dialog.Title>
          <Dialog.Content>
            <Text style={[{ color: themeColors.secondaryText, marginBottom: 12, fontSize: 14 }]}>
              All messages after this one will be deleted.
            </Text>
            <TextInput
              style={[
                styles.editInput,
                { 
                  backgroundColor: themeColors.borderColor,
                  color: themeColors.text,
                  borderColor: themeColors.headerBackground 
                }
              ]}
              value={editedMessageContent}
              onChangeText={setEditedMessageContent}
              multiline
              placeholder="Enter your message..."
              placeholderTextColor={themeColors.secondaryText}
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeEditDialog} textColor={themeColors.secondaryText}>
              Cancel
            </Button>
            <Button 
              onPress={saveEditedMessage} 
              textColor={themeColors.headerBackground}
              disabled={!editedMessageContent.trim()}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
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
  codeBlockCopyButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    padding: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 1,
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
  fullScreenImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  editInput: {
    minHeight: 80,
    maxHeight: 200,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    textAlignVertical: 'top',
  },
}); 