import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import chatManager, { Chat } from '../utils/ChatManager';
import AppHeader from '../components/AppHeader';
import { Dialog, Portal, PaperProvider, Text, Button } from 'react-native-paper';

export default function ChatHistoryScreen() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogActions, setDialogActions] = useState<React.ReactNode[]>([]);

  const hideDialog = () => setDialogVisible(false);

  const showDialog = (title: string, message: string, actions: React.ReactNode[]) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogActions(actions);
    setDialogVisible(true);
  };

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
      const allChats = chatManager.getAllChats();
      setChats(allChats);
      setCurrentChatId(chatManager.getCurrentChatId());
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSelectChat = async (chatId: string) => {
    try {
      await chatManager.setCurrentChat(chatId);
      
      navigation.navigate('MainTabs', {
        screen: 'HomeTab',
        params: { loadChatId: chatId }
      });
    } catch (error) {
      console.error('Error selecting chat:', error);
      showDialog('Error', 'Failed to load selected chat', [
        <Button key="ok" onPress={hideDialog}>OK</Button>
      ]);
    }
  };

  const getPreviewText = (chat: Chat) => {
    if (!chat.messages || chat.messages.length === 0) {
      return 'Empty chat';
    }
    
    const firstUserMessage = chat.messages.find(msg => msg.role === 'user');
    return firstUserMessage?.content || chat.title || 'New conversation';
  };

  const handleDeleteChat = (chatId: string) => {
    showDialog(
      'Delete Chat',
      'Are you sure you want to delete this chat?',
      [
        <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
        <Button
          key="delete"
          onPress={async () => {
            hideDialog();
            await chatManager.deleteChat(chatId);
          }}
        >
          Delete
        </Button>
      ]
    );
  };

  const handleDeleteAllChats = () => {
    showDialog(
      'Delete All Chats',
      'Are you sure you want to delete all chat histories? This cannot be undone.',
      [
        <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
        <Button
          key="delete"
          onPress={async () => {
            hideDialog();
            await chatManager.deleteAllChats();
          }}
        >
          Delete All
        </Button>
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
          <MaterialCommunityIcons name="delete-outline" size={20} color={themeColors.secondaryText} />
        </TouchableOpacity>
        <MaterialCommunityIcons name="chevron-right" size={24} color={themeColors.secondaryText} />
      </View>
    </TouchableOpacity>
  );

  const headerRightButtons = (
    <>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={handleCreateNewChat}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MaterialCommunityIcons name="plus" size={24} color={themeColors.headerText} />
      </TouchableOpacity>
      
      {chats.length > 0 && (
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleDeleteAllChats}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="delete-outline" size={24} color={themeColors.headerText} />
        </TouchableOpacity>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
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
                  <MaterialCommunityIcons name="plus" size={20} color={themeColors.headerText} style={styles.newChatIcon} />
                  <Text style={styles.newChatText}>Start a new chat</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>

      {/* Dialog Portal */}
      <Portal>
        <Dialog visible={dialogVisible} onDismiss={hideDialog}>
          <Dialog.Title>{dialogTitle}</Dialog.Title>
          <Dialog.Content>
            <Text>{dialogMessage}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            {dialogActions}
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
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginLeft: 8,
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