import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
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

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
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
}); 