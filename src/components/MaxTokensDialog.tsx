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
import { useResponsive } from '../hooks/useResponsive';

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
  const { dialog } = useResponsive();
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
        <View style={[
          styles.dialog, 
          { 
            backgroundColor: themeColors.background,
            width: dialog.width,
            maxWidth: dialog.maxWidth,
            padding: dialog.padding,
            borderRadius: dialog.borderRadius,
          }
        ]}>
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
                borderColor: error ? themeColors.error : themeColors.borderColor,
                backgroundColor: themeColors.cardBackground,
                height: dialog.inputHeight,
                paddingHorizontal: dialog.inputPadding,
                fontSize: 16,
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
            <Text style={[styles.error, { color: themeColors.error }]}>
              {error}
            </Text>
          )}

          <Text style={[styles.explanation, { color: themeColors.secondaryText }]}>
            Tokens are pieces of words the AI model uses to process text. More tokens = longer responses but slower generation.
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.button, 
                { 
                  backgroundColor: themeColors.cardBackground,
                  height: dialog.buttonHeight,
                  borderRadius: dialog.borderRadius / 2,
                }
              ]}
              onPress={onClose}
            >
              <Text style={[styles.buttonText, { color: themeColors.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button, 
                { 
                  backgroundColor: themeColors.primary,
                  height: dialog.buttonHeight,
                  borderRadius: dialog.borderRadius / 2,
                }
              ]}
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
    borderWidth: 1,
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
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
}); 