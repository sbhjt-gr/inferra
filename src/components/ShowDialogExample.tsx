import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useDialog } from '../context/DialogContext';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';

export const ShowDialogExample = () => {
  const { showDialog } = useDialog();
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];

  const showSimpleDialog = () => {
    showDialog({
      title: 'Information',
      message: 'This is a simple dialog with just an OK button.',
      confirmText: 'OK',
      cancelText: null
    });
  };

  const showConfirmDialog = () => {
    showDialog({
      title: 'Confirmation',
      message: 'Are you sure you want to proceed with this action?',
      confirmText: 'Yes, Proceed',
      cancelText: 'Cancel',
      onConfirm: () => {
      },
      onCancel: () => {
      }
    });
  };

  const showErrorDialog = () => {
    showDialog({
      title: 'Error',
      message: 'Something went wrong! Please try again later.',
      confirmText: 'Retry',
      cancelText: 'Close',
      onConfirm: () => {
      }
    });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: themeColors.primary }]}
        onPress={showSimpleDialog}
      >
        <Text style={styles.buttonText}>Show Simple Dialog</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: themeColors.primary }]}
        onPress={showConfirmDialog}
      >
        <Text style={styles.buttonText}>Show Confirmation Dialog</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: '#FF5252' }]}
        onPress={showErrorDialog}
      >
        <Text style={styles.buttonText}>Show Error Dialog</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
}); 
