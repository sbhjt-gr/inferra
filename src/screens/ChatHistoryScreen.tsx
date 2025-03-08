import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import chatManager, { Chat } from '../utils/ChatManager';

export default function ChatHistoryScreen() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // Subscribe to chat manager changes
  useEffect(() => {
    // Initial load
    setIsLoading(true);
    loadChats();
    
    // Subscribe to future changes
    const unsubscribe = chatManager.addListener(() => {
      loadChats();
    });
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  const loadChats = useCallback(async () => {
    try {
      const allChats = chatManager.getAllChats();
      setChats(allChats);
      setCurrentChatId(chatManager.getCurrentChatId());
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Force status bar update
  useEffect(() => {
    StatusBar.setBarStyle('light-content');
    StatusBar.setBackgroundColor(themeColors.headerBackground);
    return () => {
      // Reset to default when unmounting
      StatusBar.setBarStyle(themeColors.statusBarStyle === 'light' ? 'light-content' : 'dark-content');
      StatusBar.setBackgroundColor(themeColors.statusBarBg);
    };
  }, [currentTheme]);

  const handleSelectChat = async (chatId: string) => {
    await chatManager.setCurrentChat(chatId);
    navigation.navigate('MainTabs', {
      screen: 'HomeTab',
    });
  };

  const getPreviewText = (chat: Chat) => {
    if (!chat.messages || chat.messages.length === 0) {
      return 'Empty chat';
    }
    
    const firstUserMessage = chat.messages.find(msg => msg.role === 'user');
    return firstUserMessage?.content || chat.title || 'New conversation';
  };

  const handleDeleteChat = (chatId: string) => {
    Alert.alert(
      'Delete Chat',
      'Are you sure you want to delete this chat?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          onPress: async () => {
            await chatManager.deleteChat(chatId);
          },
          style: 'destructive'
        }
      ]
    );
  };

  const handleDeleteAllChats = () => {
    Alert.alert(
      'Delete All Chats',
      'Are you sure you want to delete all chat histories? This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete All',
          onPress: async () => {
            await chatManager.deleteAllChats();
          },
          style: 'destructive'
        }
      ]
    );
  };

  const handleCreateNewChat = async () => {
    await chatManager.createNewChat();
    navigation.navigate('MainTabs', {
      screen: 'HomeTab',
    });
  };

  const renderItem = ({ item }: { item: Chat }) => (
    <TouchableOpacity
      style={[
        styles.chatItem, 
        { 
          backgroundColor: themeColors.borderColor,
          borderLeftWidth: item.id === currentChatId ? 4 : 0,
          borderLeftColor: item.id === currentChatId ? themeColors.headerBackground : 'transparent',
        }
      ]}
      onPress={() => handleSelectChat(item.id)}
    >
      <View style={styles.chatInfo}>
        <Text style={[styles.chatPreview, { color: themeColors.text }]} numberOfLines={1}>
          {item.title || getPreviewText(item)}
        </Text>
        <Text style={[styles.chatDate, { color: themeColors.secondaryText }]}>
          {new Date(item.timestamp).toLocaleDateString()} • 
          {item.messages.length} messages
        </Text>
      </View>
      
      <View style={styles.chatActions}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteChat(item.id)}
        >
          <Ionicons name="trash-outline" size={20} color={themeColors.secondaryText} />
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={24} color={themeColors.secondaryText} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.headerBackground }}>
      <StatusBar
        backgroundColor={themeColors.headerBackground}
        barStyle="light-content"
        translucent={true}
      />
      <View style={[
        styles.header, 
        { 
          backgroundColor: themeColors.headerBackground,
          paddingTop: insets.top + 12,
        }
      ]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat History</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.newChatButton}
            onPress={handleCreateNewChat}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="add-outline" size={24} color="#fff" />
          </TouchableOpacity>
          
          {chats.length > 0 && (
            <TouchableOpacity
              style={styles.deleteAllButton}
              onPress={handleDeleteAllChats}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="trash-outline" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={themeColors.headerBackground} />
          </View>
        ) : (
          <FlatList
            data={chats}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={() => (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: themeColors.secondaryText }]}>
                  No chat history yet
                </Text>
                <TouchableOpacity
                  style={[styles.newChatButtonEmpty, { backgroundColor: themeColors.headerBackground }]}
                  onPress={handleCreateNewChat}
                >
                  <Ionicons name="add-outline" size={20} color="#fff" style={styles.newChatIcon} />
                  <Text style={styles.newChatText}>Start a new chat</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'left',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  newChatButton: {
    marginRight: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteAllButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 12,
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
}); 