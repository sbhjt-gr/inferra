import React, { useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';

export type Message = {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  thinking?: string;
  stats?: {
    duration: number;
    tokens: number;
  };
  isLoading?: boolean;
};

type ChatViewProps = {
  messages: Message[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingMessage: string;
  streamingThinking: string;
  streamingStats: { tokens: number; duration: number } | null;
  onCopyText: (text: string) => void;
  onRegenerateResponse: () => void;
  isRegenerating: boolean;
  flatListRef: React.RefObject<FlatList>;
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
  flatListRef,
}: ChatViewProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isCurrentlyStreaming = isStreaming && item.id === streamingMessageId;
    const showLoadingIndicator = isCurrentlyStreaming && !streamingMessage;
    
    let fileAttachment: { name: string; type?: string } | null = null;
    
    const processContent = (content: string): string => {
      try {
        const parsedMessage = JSON.parse(content);
        if (parsedMessage && 
            parsedMessage.type === 'file_upload' && 
            parsedMessage.internalInstruction) {
          
          console.log('Processing JSON Message:', {
            internalInstruction: parsedMessage.internalInstruction,
            userContent: parsedMessage.userContent
          });
          
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
        // Not json
      }
      
      const internalInstructionMatch = content.match(/<INTERNAL_INSTRUCTION>You're reading a file named: (.+?)\n/);
      if (internalInstructionMatch && internalInstructionMatch[1]) {
        const internalInstruction = content.match(/<INTERNAL_INSTRUCTION>([\s\S]*?)<\/INTERNAL_INSTRUCTION>/)?.[1] || '';
        
        console.log('Processing Tag-based Message:', {
          internalInstruction,
          userContent: content.replace(/<INTERNAL_INSTRUCTION>[\s\S]*?<\/INTERNAL_INSTRUCTION>/g, '')
        });
        
        fileAttachment = { 
          name: internalInstructionMatch[1],
          type: internalInstructionMatch[1].split('.').pop()?.toLowerCase() || 'txt'
        };
      }
      
      return content.replace(/<INTERNAL_INSTRUCTION>[\s\S]*?<\/INTERNAL_INSTRUCTION>/g, '');
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
        <View style={[styles.fileAttachmentWrapper, { alignSelf: 'flex-end' }]}>
          <View style={[styles.fileAttachment, { backgroundColor: themeColors.borderColor }]}>
            <View style={[styles.fileTypeIcon, { backgroundColor: fileTypeBgColor }]}>
              <Text style={styles.fileTypeText}>{fileTypeDisplay}</Text>
            </View>
            <View style={styles.fileAttachmentContent}>
              <Text style={[styles.fileAttachmentName, { color: themeColors.text }]} numberOfLines={1} ellipsizeMode="middle">
                {fileAttachment.name}
              </Text>
              <Text style={[styles.fileAttachmentType, { color: themeColors.secondaryText }]}>
                File attachment
              </Text>
            </View>
          </View>
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
              {thinkingContent}
            </Text>
          </View>
        )}
        
        {item.role === 'user' && fileAttachment && renderFileAttachment()}

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
            messageContent ? (
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
                          {codeContent}
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
                          {codeContent}
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
          )}
        </View>
      </View>
    );
  }, [themeColors, messages, isStreaming, streamingMessageId, streamingMessage, streamingThinking, streamingStats, onCopyText, isRegenerating, onRegenerateResponse]);

  return (
    <View style={styles.container}>
      {messages.length === 0 ? (
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
      ) : (
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
          removeClippedSubviews={false}
          windowSize={10}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          onEndReachedThreshold={0.5}
          scrollIndicatorInsets={{ right: 1 }}
          onLayout={() => {
            if (flatListRef.current && messages.length > 0) {
              flatListRef.current.scrollToOffset({ offset: 0, animated: false });
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messageList: {
    flexGrow: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    paddingBottom: 80,
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
    width: '85%',
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
}); 