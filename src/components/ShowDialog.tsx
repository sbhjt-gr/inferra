import React from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
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
    showLoading,
    showTitle,
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
        {showTitle && title && (
          <Dialog.Title style={{ color: themeColors.text }}>{title}</Dialog.Title>
        )}
        <Dialog.Content style={showLoading ? styles.loadingDialogContent : undefined}>
          {showLoading ? (
            <>
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={[styles.loadingDialogText, { color: themeColors.text }]}>
                {message}
              </Text>
            </>
          ) : (
            <Text style={[styles.message, { color: themeColors.text }]}>
              {message}
            </Text>
          )}
        </Dialog.Content>
        {!showLoading && (
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
        )}
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  message: {
    fontSize: 16,
    lineHeight: 24,
  },
  loadingDialogContent: {
    alignItems: 'center',
    gap: 16,
  },
  loadingDialogText: {
    fontSize: 16,
    textAlign: 'center',
  },
}); 
