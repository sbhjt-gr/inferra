import { useEffect, useState } from 'react';
import { Keyboard, Platform, KeyboardEvent } from 'react-native';
import { enableKeyboardResize } from './NativeKeyboardModule';

/**
 * Hook to manage keyboard events and state
 * @returns Object containing keyboard height and visible state
 */
export const useKeyboardManager = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    // Enable resize mode on component mount (for Android)
    if (Platform.OS === 'android') {
      enableKeyboardResize();
    }

    // Different events for iOS and Android
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    
    // Subscribe to keyboard events
    const keyboardShowListener = Keyboard.addListener(
      showEvent,
      (e: KeyboardEvent) => {
        setKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    
    const keyboardHideListener = Keyboard.addListener(
      hideEvent,
      () => {
        setKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    );

    // Clean up listeners
    return () => {
      keyboardShowListener.remove();
      keyboardHideListener.remove();
    };
  }, []);

  return {
    keyboardHeight,
    keyboardVisible,
    dismissKeyboard: Keyboard.dismiss
  };
};

/**
 * Get keyboard vertical offset based on platform and screen size
 * @returns Appropriate keyboard vertical offset
 */
export const getKeyboardVerticalOffset = (): number => {
  // iOS typically needs a larger offset to properly position the input
  if (Platform.OS === 'ios') {
    return 0; // Adjust this if needed based on your app's layout
  }
  
  // Android typically needs a smaller offset
  return 0;
};

/**
 * Get keyboard behavior based on platform
 * @returns Keyboard behavior 'padding' for iOS or 'height' for Android
 */
export const getKeyboardBehavior = (): 'padding' | 'height' | undefined => {
  return Platform.OS === 'ios' ? 'padding' : 'height';
}; 