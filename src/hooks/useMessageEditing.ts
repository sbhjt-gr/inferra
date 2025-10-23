import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { ChatMessage } from '../utils/ChatManager';
import chatManager from '../utils/ChatManager';

export const useMessageEditing = (messages: ChatMessage[], onProcessMessage: () => void) => {
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');

  const handleEditingStateChange = useCallback((isEditing: boolean) => {
    setIsEditingMessage(isEditing);
  }, []);

  const handleStartEdit = useCallback((messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingMessageText(content);
    setIsEditingMessage(true);
  }, []);

  const handleSaveEdit = useCallback(async (text: string) => {
    if (!editingMessageId || !text.trim()) {
      handleCancelEdit();
      return;
    }

    try {
      const originalMessage = messages.find(msg => msg.id === editingMessageId);
      if (!originalMessage) {
        Alert.alert('Error', 'Original message not found');
        return;
      }

      let finalContent = text.trim();

      try {
        const parsedOriginal = JSON.parse(originalMessage.content);
        
        if (parsedOriginal && parsedOriginal.type === 'file_upload') {
          finalContent = JSON.stringify({
            ...parsedOriginal,
            userContent: text.trim()
          });
        } else if (parsedOriginal && parsedOriginal.type === 'multimodal' && parsedOriginal.content) {
          const updatedContent = parsedOriginal.content.map((item: any) => {
            if (item.type === 'text') {
              return { ...item, text: text.trim() };
            }
            return item;
          });
          finalContent = JSON.stringify({
            ...parsedOriginal,
            content: updatedContent
          });
        } else if (parsedOriginal && parsedOriginal.type === 'ocr_result') {
          finalContent = JSON.stringify({
            ...parsedOriginal,
            userPrompt: text.trim()
          });
        }
      } catch (e) {
        finalContent = text.trim();
      }

      const success = await chatManager.editMessage(editingMessageId, finalContent);
      
      if (success) {
        handleCancelEdit();
        setTimeout(async () => {
          await onProcessMessage();
        }, 50);
      } else {
        Alert.alert('Error', 'Failed to edit message');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to edit message');
    }
  }, [editingMessageId, messages, onProcessMessage]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingMessageText('');
    setIsEditingMessage(false);
  }, []);

  return {
    isEditingMessage,
    editingMessageId,
    editingMessageText,
    handleEditingStateChange,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
  };
};
