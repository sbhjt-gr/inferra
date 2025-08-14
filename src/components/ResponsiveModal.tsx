import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { useResponsive } from '../hooks/useResponsive';

interface ResponsiveModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  avoidKeyboard?: boolean;
  dismissOnOverlayPress?: boolean;
}

export default function ResponsiveModal({
  visible,
  onClose,
  children,
  avoidKeyboard = true,
  dismissOnOverlayPress = true,
}: ResponsiveModalProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const { dialog } = useResponsive();

  const content = (
    <View style={styles.overlay}>
      <TouchableWithoutFeedback
        onPress={dismissOnOverlayPress ? onClose : undefined}
      >
        <View style={styles.overlayTouchable} />
      </TouchableWithoutFeedback>
      
      <View
        style={[
          styles.container,
          {
            backgroundColor: themeColors.background,
            width: dialog.width,
            maxWidth: dialog.maxWidth,
            padding: dialog.padding,
            borderRadius: dialog.borderRadius,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );

  if (!avoidKeyboard) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        {content}
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          {content}
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    maxHeight: '90%',
  },
});