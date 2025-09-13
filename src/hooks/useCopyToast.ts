import { useState, useRef, useCallback, useEffect } from 'react';
import { ToastAndroid, Platform } from 'react-native';

export const useCopyToast = () => {
  const [showCopyToast, setShowCopyToast] = useState(false);
  const copyToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const copyToastMessageRef = useRef<string>('Copied to clipboard');

  const showToast = useCallback((message?: string) => {
    if (copyToastTimeoutRef.current) {
      clearTimeout(copyToastTimeoutRef.current);
    }
    
    if (message) {
      copyToastMessageRef.current = message;
    }
    
    if (Platform.OS === 'android') {
      ToastAndroid.show(copyToastMessageRef.current, ToastAndroid.SHORT);
    } else {
      setShowCopyToast(true);
      copyToastTimeoutRef.current = setTimeout(() => {
        setShowCopyToast(false);
        copyToastTimeoutRef.current = null;
      }, 2000);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (copyToastTimeoutRef.current) {
        clearTimeout(copyToastTimeoutRef.current);
      }
    };
  }, []);

  return {
    showCopyToast,
    copyToastMessage: copyToastMessageRef.current,
    showToast,
  };
};
