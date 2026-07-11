import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { GradientBg } from '../services/adapters/GradientBgAdapter';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import chatManager, { Chat } from '../utils/ChatManager';
import AppHeader from '../components/AppHeader';
import { Text } from 'react-native-paper';
import Dialog from '../components/Dialog';
import { useDialog } from '../hooks/useDialog';

const PAGE_SIZE = 15;

export default function ChatHistoryScreen() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const router = useRouter();

  const allChatsRef = useRef<Chat[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const pageRef = useRef(1);

  const { dialogVisible, dialogTitle, dialogMessage, dialogPrimaryText, dialogPrimaryPress, dialogSecondaryText, dialogSecondaryPress, showDialog, hideDialog } = useDialog();

  useEffect(() => {
    setIsLoading(true);
    loadChats();
    
    const unsubscribe = chatManager.addListener(() => {
      loadChats();
    });
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  const loadChats = useCallback(async () => {
    try {
      const roots = chatManager.getRootChats();
      allChatsRef.current = roots;
      pageRef.current = 1;
      setChats(roots.slice(0, PAGE_SIZE));
      setCurrentChatId(chatManager.getCurrentChatId());
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    const all = allChatsRef.current;
    const nextPage = pageRef.current + 1;
    const nextSlice = all.slice(0, nextPage * PAGE_SIZE);
    if (nextSlice.length <= chats.length) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      pageRef.current = nextPage;
      setChats(nextSlice);
      setIsLoadingMore(false);
    }, 300);
  }, [chats.length]);

  const handleSelectChat = async (chatId: string) => {
    try {
      await chatManager.flushPendingSaves();
      const latest = chatManager.getLatestBranch(chatId);
      const targetId = latest?.id ?? chatId;
      router.dismissAll();
      router.replace({ pathname: '/(tabs)', params: { loadChatId: targetId } });
    } catch (error) {
      showDialog('Error', 'Failed to load selected chat');
    }
  };

  const getPreviewText = (chat: Chat) => {
    if (!chat.messages || chat.messages.length === 0) {
      return 'Empty chat';
    }
    
    const firstUserMessage = chat.messages.find(msg => msg.role === 'user');
    return firstUserMessage?.content || chat.title || 'New conversation';
  };

  const getLastResponderModel = (chat: Chat) => {
    for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
      const message = chat.messages[index];
      if (message.role === 'assistant' && message.modelName) {
        return message.modelName;
      }
    }
    return null;
  };

  const handleDeleteChat = (chatId: string) => {
    showDialog(
      'Delete Chat',
      'Are you sure you want to delete this chat?',
      { label: 'Delete', onPress: async () => { hideDialog(); await chatManager.deleteChat(chatId); } },
      { label: 'Cancel', onPress: hideDialog }
    );
  };

  const handleTogglePin = async (chatId: string) => {
    await chatManager.togglePin(chatId);
  };

  const handleDeleteAllChats = () => {
    showDialog(
      'Delete All Chats',
      'Are you sure you want to delete all chat histories? This cannot be undone.',
      { label: 'Delete All', onPress: async () => { hideDialog(); await chatManager.deleteAllChats(); } },
      { label: 'Cancel', onPress: hideDialog }
    );
  };

  const handleCreateNewChat = async () => {
    await chatManager.createNewChat();
    router.replace('/(tabs)');
  };

  const renderItem = ({ item }: { item: Chat }) => {
    const lastResponderModel = getLastResponderModel(item);
    const isActive = item.id === currentChatId;

    return (
    <TouchableOpacity
      style={[
        styles.chatItem, 
        { 
          backgroundColor: isActive ? themeColors.cardBackground : themeColors.borderColor,
          borderWidth: isActive ? 1 : 0,
          borderColor: isActive ? themeColors.primary : 'transparent',
        }
      ]}
      onPress={() => handleSelectChat(item.id)}
    >
      <View style={styles.chatInfo}>
        <Text
          style={[
            styles.chatPreview,
            { color: themeColors.text },
            isActive && { color: themeColors.primary },
          ]}
          numberOfLines={1}
        >
          {item.title || getPreviewText(item)}
        </Text>
        <Text style={[styles.chatDate, { color: themeColors.secondaryText }]}>
          {new Date(item.timestamp).toLocaleDateString()} • 
          {item.messages.length} messages
        </Text>
        {lastResponderModel ? (
          <Text style={[styles.chatModel, { color: themeColors.secondaryText }]} numberOfLines={1}>
            {lastResponderModel}
          </Text>
        ) : null}
        {chatManager.getBranchCount(item.id) > 0 ? (
          <View style={styles.branchBadge}>
            <MaterialCommunityIcons name="source-branch" size={14} color={themeColors.secondaryText} />
            <Text style={[styles.branchBadgeText, { color: themeColors.secondaryText }]}>
              {chatManager.getBranchCount(item.id)} {chatManager.getBranchCount(item.id) === 1 ? 'branch' : 'branches'}
            </Text>
          </View>
        ) : null}
      </View>
      
      <View style={styles.chatActions}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleTogglePin(item.id)}
        >
          <MaterialCommunityIcons 
            name={item.pinned ? "pin" : "pin-outline"} 
            size={20} 
            color={item.pinned ? themeColors.primary : themeColors.secondaryText} 
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteChat(item.id)}
        >
          <MaterialCommunityIcons name="delete-outline" size={20} color={themeColors.secondaryText} />
        </TouchableOpacity>
        <MaterialCommunityIcons name="chevron-right" size={24} color={themeColors.secondaryText} />
      </View>
    </TouchableOpacity>
    );
  };

  const sections = React.useMemo(() => {
    const pinned = chats.filter(c => c.pinned);
    const others = chats.filter(c => !c.pinned);
    const result: { title: string; data: Chat[] }[] = [];
    if (pinned.length > 0) result.push({ title: 'Pinned', data: pinned });
    if (others.length > 0) result.push({ title: 'Chats', data: others });
    return result;
  }, [chats]);

  const headerRightButtons = (
    <>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={handleCreateNewChat}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MaterialCommunityIcons name="plus" size={24} color={Platform.OS === 'ios' && currentTheme === 'light' ? themeColors.primary : themeColors.headerText} />
      </TouchableOpacity>
      
      {chats.length > 0 && (
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleDeleteAllChats}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="delete-outline" size={24} color={Platform.OS === 'ios' && currentTheme === 'light' ? themeColors.primary : themeColors.headerText} />
        </TouchableOpacity>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <GradientBg />
      <AppHeader 
        title="Chat History"
        showBackButton
        showLogo={false}
        rightButtons={headerRightButtons}
      />
      
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={themeColors.headerBackground} />
          </View>
        ) : (
          <SectionList
            sections={sections}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => (
              <Text style={[styles.sectionHeader, { color: themeColors.secondaryText }]}>
                {section.title}
              </Text>
            )}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={isLoadingMore ? (
              <ActivityIndicator
                size="small"
                color={themeColors.headerBackground}
                style={styles.footerLoader}
              />
            ) : null}
            ListEmptyComponent={() => (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: themeColors.secondaryText }]}>
                  No chat history yet
                </Text>
                <TouchableOpacity
                  style={[styles.newChatButtonEmpty, { backgroundColor: themeColors.headerBackground }]}
                  onPress={handleCreateNewChat}
                >
                  <MaterialCommunityIcons name="plus" size={20} color={Platform.OS === 'ios' && currentTheme === 'light' ? themeColors.primary : themeColors.headerText} style={styles.newChatIcon} />
                  <Text style={styles.newChatText}>Start a new chat</Text>
                </TouchableOpacity>
              </View>
            )}
            stickySectionHeadersEnabled={false}
          />
        )}
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    width: Platform.OS === 'ios' ? 44 : 40,
    height: Platform.OS === 'ios' ? 44 : 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Platform.OS === 'ios' ? 0 : 20,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(255, 255, 255, 0.15)',
    marginLeft: Platform.OS === 'ios' ? 0 : 8,
  },
  listContent: {
    padding: 12,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 8,
  },
  chatItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  chatInfo: {
    flex: 1,
    paddingRight: 8,
  },
  chatPreview: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  chatDate: {
    fontSize: 14,
  },
  chatModel: {
    fontSize: 12,
    marginTop: 2,
  },
  chatActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    padding: 8,
    marginRight: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newChatButtonEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
  },
  newChatText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  newChatIcon: {
    marginRight: 8,
  },
  footerLoader: {
    paddingVertical: 16,
  },
  branchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  branchBadgeText: {
    fontSize: 12,
    marginLeft: 4,
  },
}); 
