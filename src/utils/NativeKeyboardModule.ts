import { NativeModules, Platform } from 'react-native';

interface KeyboardModuleInterface {
  enableResize: () => void;
  enablePan: () => void;
  setKeyboardVerticalOffset: (offset: number) => void;
}

// Default implementation for iOS, which doesn't need our custom module
const defaultModule: KeyboardModuleInterface = {
  enableResize: () => {},
  enablePan: () => {},
  setKeyboardVerticalOffset: () => {},
};

// Get the native module if available (on Android)
const NativeKeyboardModule: KeyboardModuleInterface = 
  Platform.OS === 'android' && NativeModules.KeyboardModule
    ? NativeModules.KeyboardModule
    : defaultModule;

// Helper functions to ensure keyboard handling works correctly on both platforms
export const enableKeyboardResize = (): void => {
  if (Platform.OS === 'android') {
    NativeKeyboardModule.enableResize();
  }
};

export const enableKeyboardPan = (): void => {
  if (Platform.OS === 'android') {
    NativeKeyboardModule.enablePan();
  }
};

export const setKeyboardVerticalOffset = (offset: number): void => {
  if (Platform.OS === 'android') {
    NativeKeyboardModule.setKeyboardVerticalOffset(offset);
  }
};

export default NativeKeyboardModule; 