import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  FlatList,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { useResponsive } from '../hooks/useResponsive';
import ModelSelector, { ModelSelectorRef } from './ModelSelector';
import chatManager, { Chat } from '../utils/ChatManager';

interface TabletSidebarProps {
  modelSelectorRef: React.RefObject<ModelSelectorRef | null>;
  shouldOpenModelSelector: boolean;
  onCloseModelSelector: () => void;
  preselectedModelPath: string | null;
  isGenerating: boolean;
  onModelSelect: (provider: 'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude', modelPath?: string, projectorPath?: string) => void;
  onNewChat: () => void;
  onChatHistory: () => void;
  onChatSelect?: (chatId: string) => void;
  activeProvider: 'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude' | null;
}


export default function TabletSidebar({
  modelSelectorRef,
  shouldOpenModelSelector,
  onCloseModelSelector,
  preselectedModelPath,
  isGenerating,
  onModelSelect,
  onNewChat,
  onChatHistory,
  onChatSelect,
  activeProvider,
}: TabletSidebarProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const { paddingHorizontal, fontSize } = useResponsive();
  const [isMinimized, setIsMinimized] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const widthAnimation = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.timing(widthAnimation, {
      toValue: isMinimized ? 0 : 300,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isMinimized, widthAnimation]);

  const handleToggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  const loadChats = useCallback(async () => {
    try {
      const allChats = chatManager.getAllChats();
      setChats(allChats);
      setCurrentChatId(chatManager.getCurrentChatId());
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  }, []);

  const handleChatHistoryToggle = () => {
    if (!showChatHistory) {
      loadChats();
    }
    setShowChatHistory(!showChatHistory);
  };

  const handleSelectChat = async (chatId: string) => {
    try {
      await chatManager.setCurrentChat(chatId);
      if (onChatSelect) {
        onChatSelect(chatId);
      }
      setShowChatHistory(false);
    } catch (error) {
      console.error('Error selecting chat:', error);
    }
  };

  const getPreviewText = (chat: Chat) => {
    if (!chat.messages || chat.messages.length === 0) {
      return 'Empty chat';
    }
    
    const firstUserMessage = chat.messages.find(msg => msg.role === 'user');
    return firstUserMessage?.content || chat.title || 'New conversation';
  };

  useEffect(() => {
    const unsubscribe = chatManager.addListener(() => {
      if (showChatHistory) {
        loadChats();
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [showChatHistory, loadChats]);

  const getModelDisplayName = () => {
    if (activeProvider === 'local') {
      const modelPath = preselectedModelPath;
      if (modelPath) {
        const modelFileName = modelPath.split('/').pop() || '';
        return modelFileName.split('.')[0];
      }
      return 'Local Model';
    } else if (activeProvider === 'gemini') {
      return 'Gemini';
    } else if (activeProvider === 'chatgpt') {
      return 'GPT-4o';
    } else if (activeProvider === 'deepseek') {
      return 'DeepSeek R1';
    } else if (activeProvider === 'claude') {
      return 'Claude';
    }
    return 'Select Model';
  };

  const getModelIcon = () => {
    if (activeProvider === 'local') {
      return 'cube';
    } else if (activeProvider) {
      return 'cloud';
    }
    return 'cube-outline';
  };

  return (
    <View style={styles.sidebarContainer}>
      <Animated.View style={[
        styles.sidebar, 
        { 
          backgroundColor: themeColors.cardBackground,
          width: widthAnimation
        }
      ]}>
        {!isMinimized && (
          <>
            <View style={styles.sidebarHeader}>
              <TouchableOpacity
                style={[styles.minimizeButton, { backgroundColor: themeColors.borderColor }]}
                onPress={handleToggleMinimize}
              >
                <MaterialCommunityIcons 
                  name="chevron-left"
                  size={20} 
                  color={themeColors.text} 
                />
              </TouchableOpacity>
            </View>
            
            <View style={styles.sidebarContent}>
              <View style={[styles.sidebarSection, { paddingHorizontal: paddingHorizontal / 2 }]}>
                <Text style={[styles.sectionTitle, { color: themeColors.text, fontSize: fontSize.medium }]}>
                  Quick Actions
                </Text>
                
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: themeColors.primary }]}
                  onPress={onNewChat}
                >
                  <MaterialCommunityIcons name="plus" size={20} color="#fff" />
                  <Text style={[styles.actionButtonText, { color: '#fff', fontSize: fontSize.small }]}>
                    New Chat
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: showChatHistory ? themeColors.primary : themeColors.borderColor }]}
                  onPress={handleChatHistoryToggle}
                >
                  <MaterialCommunityIcons name="clock-outline" size={20} color={showChatHistory ? '#fff' : themeColors.text} />
                  <Text style={[styles.actionButtonText, { color: showChatHistory ? '#fff' : themeColors.text, fontSize: fontSize.small }]}>
                    Chat History
                  </Text>
                </TouchableOpacity>
              </View>

              {showChatHistory && (
                <View style={[styles.sidebarSection, { paddingHorizontal: paddingHorizontal / 2, flex: 1, minHeight: 200 }]}>
                  <Text style={[styles.sectionTitle, { color: themeColors.text, fontSize: fontSize.medium }]}>
                    Recent Chats
                  </Text>
                  <FlatList
                    data={chats.slice(0, 10)}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          styles.chatHistoryItem,
                          { 
                            backgroundColor: item.id === currentChatId ? themeColors.primary : themeColors.borderColor,
                            borderColor: themeColors.borderColor 
                          }
                        ]}
                        onPress={() => handleSelectChat(item.id)}
                      >
                        <Text 
                          style={[
                            styles.chatHistoryText, 
                            { 
                              color: item.id === currentChatId ? '#fff' : themeColors.text,
                              fontSize: fontSize.small 
                            }
                          ]}
                          numberOfLines={2}
                        >
                          {getPreviewText(item)}
                        </Text>
                        <Text 
                          style={[
                            styles.chatHistoryDate, 
                            { 
                              color: item.id === currentChatId ? 'rgba(255,255,255,0.7)' : themeColors.secondaryText,
                              fontSize: fontSize.small * 0.9
                            }
                          ]}
                        >
                          {new Date(item.createdAt).toLocaleDateString()}
                        </Text>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                      <Text style={[styles.emptyChatText, { color: themeColors.secondaryText, fontSize: fontSize.small }]}>
                        No chat history
                      </Text>
                    }
                  />
                </View>
              )}

              {!showChatHistory && (
                <>
                  <View style={[styles.sidebarSection, { paddingHorizontal: paddingHorizontal / 2 }]}>
                    <Text style={[styles.sectionTitle, { color: themeColors.text, fontSize: fontSize.medium }]}>
                      Current Model
                    </Text>
                  
                    <View style={[styles.modelInfo, { backgroundColor: themeColors.background, borderColor: themeColors.borderColor }]}>
                      <MaterialCommunityIcons
                        name={getModelIcon() as any}
                        size={24}
                        color={themeColors.primary}
                      />
                      <View style={styles.modelTextContainer}>
                        <Text style={[styles.modelName, { color: themeColors.text, fontSize: fontSize.small }]}>
                          {getModelDisplayName()}
                        </Text>
                        <Text style={[styles.modelType, { color: themeColors.secondaryText, fontSize: fontSize.small }]}>
                          {activeProvider === 'local' ? 'Local' : 'Cloud'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.sidebarSection, { flex: 1, minHeight: 0 }]}>
                    <Text style={[styles.sectionTitle, { color: themeColors.text, fontSize: fontSize.medium, paddingHorizontal: paddingHorizontal / 2 }]}>
                      Available Models
                    </Text>
                    <View style={{ paddingHorizontal: paddingHorizontal / 2, flex: 1 }}>
                      <ModelSelector 
                        ref={modelSelectorRef}
                        isOpen={shouldOpenModelSelector}
                        onClose={onCloseModelSelector}
                        preselectedModelPath={preselectedModelPath}
                        isGenerating={isGenerating}
                        onModelSelect={onModelSelect}
                        isSidebarContext={true}
                      />
                    </View>
                  </View>
                </>
              )}
            </View>
          </>
        )}
      </Animated.View>
      
      {isMinimized && (
        <TouchableOpacity
          style={[styles.floatingButton, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.borderColor }]}
          onPress={handleToggleMinimize}
        >
          <MaterialCommunityIcons 
            name="chevron-right"
            size={20} 
            color={themeColors.text} 
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebarContainer: {
    position: 'relative',
    height: '100%',
    overflow: 'visible',
  },
  sidebar: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    height: '100%',
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 12,
    paddingRight: 6,
    paddingBottom: 8,
    minWidth: 48,
  },
  minimizeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1000,
  },
  sidebarContent: {
    flex: 1,
    paddingTop: 12,
  },
  sidebarSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  actionButtonText: {
    fontWeight: '500',
    marginLeft: 8,
  },
  modelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  modelTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  modelName: {
    fontWeight: '500',
  },
  modelType: {
    marginTop: 2,
  },
  chatHistoryItem: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  chatHistoryText: {
    fontWeight: '500',
    marginBottom: 4,
  },
  chatHistoryDate: {
    fontSize: 11,
  },
  emptyChatText: {
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 20,
  },
});