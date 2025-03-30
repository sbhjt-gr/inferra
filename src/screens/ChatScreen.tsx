import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Text,
  FlatList,
  Platform,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { llamaManager } from '../utils/LlamaManager';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ChatScreen() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const settings = llamaManager.getSettings();
    setMessages([
      {
        role: 'system',
        content: settings.systemPrompt
      },
    ]);
  }, []);

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    
    if (!llamaManager.getModelPath()) {
      Alert.alert('Error', 'Please select a model first');
      return;
    }

    try {
      setIsLoading(true);
      const content = input.trim();
      setInput('');
      
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
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['right', 'left']}>
      <View style={styles.messagesContainer}>
        <FlatList
          ref={flatListRef}
          data={messages.filter(m => m.role !== 'system')}
          renderItem={renderMessage}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={styles.messageList}
          inverted={true}
          removeClippedSubviews={Platform.OS === 'android'}
          windowSize={10}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
        />
        {isLoading && (
          <ActivityIndicator 
            size="large" 
            color={themeColors.headerBackground} 
            style={styles.loading} 
          />
        )}
      </View>
      
      <View style={[styles.inputContainer, { borderTopColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }]}>
        <View style={[styles.inputWrapper, currentTheme === 'dark' && { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]}>
          <TextInput
            style={[styles.input, currentTheme === 'dark' && { color: '#fff' }]}
            value={input}
            onChangeText={setInput}
            placeholder="Send a message..."
            placeholderTextColor={currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)'}
            multiline
            editable={!isLoading}
            returnKeyType="default"
          />
        </View>
        
        <TouchableOpacity 
          style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]} 
          onPress={handleSendMessage}
          disabled={!input.trim() || isLoading}
        >
          <Ionicons 
            name="send" 
            size={24} 
            color={input.trim() ? '#660880' : currentTheme === 'dark' ? '#666' : '#999'} 
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  messagesContainer: {
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
    paddingBottom: 24,
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderTopWidth: 1,
    backgroundColor: 'transparent',
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 24,
    marginRight: 8,
    paddingHorizontal: 16,
    minHeight: 48,
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  input: {
    fontSize: 16,
    maxHeight: 120,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    color: '#000',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginRight: 8,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
}); 