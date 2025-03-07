import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';

interface MaxTokensDialogProps {
  visible: boolean;
  onClose: () => void;
  onSave: (tokens: number) => void;
  currentValue: number;
}

export default function MaxTokensDialog({
  visible,
  onClose,
  onSave,
  currentValue,
}: MaxTokensDialogProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const [tokens, setTokens] = useState(currentValue.toString());
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const numTokens = parseInt(tokens, 10);
    if (isNaN(numTokens) || numTokens < 1 || numTokens > 4096) {
      setError('Please enter a number between 1 and 4096');
      return;
    }
    onSave(numTokens);
    onClose();
  };

  const handleChange = (value: string) => {
    setTokens(value);
    setError(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={[styles.dialog, { backgroundColor: themeColors.background }]}>
          <Text style={[styles.title, { color: themeColors.text }]}>
            Max Response Tokens
          </Text>
          
          <Text style={[styles.description, { color: themeColors.secondaryText }]}>
            Set the maximum number of tokens for model responses (1-4096)
          </Text>

          <TextInput
            style={[
              styles.input,
              { 
                color: themeColors.text,
                borderColor: error ? theme.light.error : themeColors.borderColor,
                backgroundColor: themeColors.cardBackground,
              },
            ]}
            value={tokens}
            onChangeText={handleChange}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="Enter tokens"
            placeholderTextColor={themeColors.secondaryText}
          />

          {error && (
            <Text style={[styles.error, { color: theme.light.error }]}>
              {error}
            </Text>
          )}

          <Text style={[styles.explanation, { color: themeColors.secondaryText }]}>
            Tokens are pieces of words the AI model uses to process text. More tokens = longer responses but slower generation.
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: themeColors.cardBackground }]}
              onPress={onClose}
            >
              <Text style={[styles.buttonText, { color: themeColors.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: themeColors.primary }]}
              onPress={handleSave}
            >
              <Text style={[styles.buttonText, { color: '#fff' }]}>
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  dialog: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    marginBottom: 16,
  },
  input: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 8,
  },
  error: {
    fontSize: 12,
    marginBottom: 8,
  },
  explanation: {
    fontSize: 12,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
}); 