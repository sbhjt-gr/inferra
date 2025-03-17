import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Text,
  FlatList,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { llamaManager } from '../utils/LlamaManager';

export default function ChatScreen() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const settings = llamaManager.getSettings();
    setMessages([
      {
        role: 'system',
        content: settings.systemPrompt
      },
    ]);
  }, []);

  const handleSendMessage = async (content: string) => {
    if (!llamaManager.getModelPath()) {
      Alert.alert('Error', 'Please select a model first');
      return;
    }

    try {
      setIsLoading(true);
      
      const updatedMessages = [
        ...messages,
        { role: 'user', content },
      ];
      setMessages(updatedMessages);

      // Generate response
      const response = await llamaManager.generateResponse(updatedMessages);
      
      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: response },
      ]);
    } catch (error) {
      console.error('Chat error:', error);
      Alert.alert('Error', 'Failed to generate response');
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: { role: string; content: string } }) => (
    <View style={styles.messageContainer}>
      <View style={[
        styles.messageCard,
        { 
          backgroundColor: item.role === 'user' ? themeColors.headerBackground : themeColors.borderColor,
          alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
          borderTopRightRadius: item.role === 'user' ? 4 : 20,
          borderTopLeftRadius: item.role === 'user' ? 20 : 4,
        }
      ]}>
        <View style={styles.messageContent}>
          <Text 
            style={[
              styles.messageText,
              { color: item.role === 'user' ? '#fff' : themeColors.text }
            ]}
            selectable={true}
          >
            {item.content}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={styles.messageList}
        inverted={true}
      />
      {isLoading && (
        <ActivityIndicator 
          size="large" 
          color={themeColors.headerBackground} 
          style={styles.loading} 
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -20 }, { translateY: -20 }],
  },
  messageList: {
    flexGrow: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
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
}); 