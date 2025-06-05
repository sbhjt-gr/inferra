import React from 'react';
import { StyleSheet } from 'react-native';
import { Dialog, Portal, Button, Text } from 'react-native-paper';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { useDialog } from '../context/DialogContext';

export const ShowDialog = () => {
  const { 
    visible, 
    title, 
    message, 
    confirmText, 
    cancelText, 
    onConfirm, 
    onCancel 
  } = useDialog();

  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onCancel}
        style={{ backgroundColor: themeColors.background }}
      >
        <Dialog.Title style={{ color: themeColors.text }}>{title}</Dialog.Title>
        <Dialog.Content>
          <Text style={[styles.message, { color: themeColors.text }]}>
            {message}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          {cancelText && (
            <Button 
              onPress={onCancel} 
              textColor={themeColors.secondaryText}
            >
              {cancelText}
            </Button>
          )}
          <Button 
            onPress={onConfirm} 
            textColor={themeColors.primary}
          >
            {confirmText}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  message: {
    fontSize: 16,
    lineHeight: 24,
  },
}); 