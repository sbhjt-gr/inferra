import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ChatHistoryItem = {
  id: string;
  messages: Array<{
    content: string;
    role: string;
  }>;
  timestamp: number;
};

// Add this type for navigation params
type NavigationParams = {
  onChatDeleted?: (chatId: string) => void;
  onAllChatsDeleted?: () => void;
};

export default function ChatHistoryScreen() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const [histories, setHistories] = useState<ChatHistoryItem[]>([]);

  // Get navigation params
  const route = useRoute();
  const params = route.params as NavigationParams;

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

  useEffect(() => {
    loadHistories();
  }, []);

  const loadHistories = async () => {
    try {
      const savedHistories = await AsyncStorage.getItem('chatHistories');
      if (savedHistories) {
        const parsed = JSON.parse(savedHistories);
        // Ensure we have valid data
        if (Array.isArray(parsed)) {
          setHistories(parsed);
        } else {
          // Reset if data is invalid
          setHistories([]);
          await AsyncStorage.setItem('chatHistories', JSON.stringify([]));
        }
      } else {
        setHistories([]);
      }
    } catch (error) {
      console.error('Error loading chat histories:', error);
      // Reset on error
      setHistories([]);
      await AsyncStorage.setItem('chatHistories', JSON.stringify([]));
    }
  };

  // Add sorting function
  const sortedHistories = [...histories].sort((a, b) => b.timestamp - a.timestamp);

  const getPreviewText = (messages: ChatHistoryItem['messages']) => {
    const firstUserMessage = messages.find(msg => msg.role === 'user');
    return firstUserMessage?.content || 'Empty chat';
  };

  // Update handleDelete to notify HomeScreen
  const handleDelete = async (chatId?: string) => {
    try {
      let updatedHistories: ChatHistoryItem[];
      
      if (chatId) {
        // Delete single chat
        updatedHistories = histories.filter(chat => chat.id !== chatId);
        // Notify HomeScreen about deleted chat
        params.onChatDeleted?.(chatId);
      } else {
        // Delete all chats
        updatedHistories = [];
        // Notify HomeScreen about all chats deleted
        params.onAllChatsDeleted?.();
      }
      
      // Update AsyncStorage first
      await AsyncStorage.setItem('chatHistories', JSON.stringify(updatedHistories));
      // Then update state
      setHistories(updatedHistories);
      
      // Also clear current chat if it was deleted
      if (chatId) {
        const currentMessages = await AsyncStorage.getItem('chatMessages');
        if (currentMessages) {
          const messages = JSON.parse(currentMessages);
          if (messages.length > 0) {
            await AsyncStorage.setItem('chatMessages', JSON.stringify([]));
          }
        }
      }
    } catch (error) {
      console.error('Error deleting chat(s):', error);
      Alert.alert('Error', 'Failed to delete chat(s). Please try again.');
    }
  };

  // Update the deleteChat function
  const deleteChat = (chatId: string) => {
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
          onPress: () => handleDelete(chatId),
          style: 'destructive'
        }
      ]
    );
  };

  // Update the deleteAllChats function
  const deleteAllChats = () => {
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
          onPress: () => handleDelete(),
          style: 'destructive'
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: ChatHistoryItem }) => (
    <TouchableOpacity
      style={[styles.chatItem, { backgroundColor: themeColors.borderColor }]}
      onPress={() => {
        navigation.navigate('MainTabs', {
          screen: 'HomeTab',
          params: { chatId: item.id }
        });
      }}
    >
      <View style={styles.chatInfo}>
        <Text style={[styles.chatPreview, { color: themeColors.text }]} numberOfLines={2}>
          {getPreviewText(item.messages)}
        </Text>
        <Text style={[styles.chatDate, { color: themeColors.secondaryText }]}>
          {new Date(item.timestamp).toLocaleDateString()} • 
          {item.messages.length} messages
        </Text>
      </View>
      
      <View style={styles.chatActions}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deleteChat(item.id)}
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
        backgroundColor="transparent"
        barStyle="light-content"
        translucent={true}
      />
      <View style={[
        styles.header, 
        { 
          backgroundColor: themeColors.headerBackground,
          paddingTop: insets.top + 10, // Add status bar height plus padding
        }
      ]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat History</Text>
        {histories.length > 0 && (
          <TouchableOpacity
            style={styles.deleteAllButton}
            onPress={deleteAllChats}
          >
            <Ionicons name="trash-outline" size={24} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
      
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <FlatList
          data={sortedHistories}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: themeColors.secondaryText }]}>
                No chat history yet
              </Text>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  listContent: {
    padding: 16,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  chatInfo: {
    flex: 1,
    marginRight: 16,
  },
  chatPreview: {
    fontSize: 16,
    marginBottom: 4,
  },
  chatDate: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 32,
  },
  emptyText: {
    fontSize: 16,
  },
  deleteAllButton: {
    marginLeft: 'auto',
    padding: 8,
  },
  chatActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  deleteButton: {
    padding: 8,
  },
}); 