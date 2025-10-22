import { useState, useCallback } from 'react';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useMemoryWarning = () => {
  const [showMemoryWarning, setShowMemoryWarning] = useState(false);
  const [memoryWarningType, setMemoryWarningType] = useState('');

  const checkSystemMemory = useCallback(async () => {
    try {
      const totalMemoryBytes = Device.totalMemory;
      if (totalMemoryBytes && totalMemoryBytes < 2 * 1024 * 1024 * 1024) {
        const hasShownVeryLowMemoryWarning = await AsyncStorage.getItem('hasShownVeryLowMemoryWarning');
        if (!hasShownVeryLowMemoryWarning) {
          setMemoryWarningType('very_low_memory');
          setShowMemoryWarning(true);
        }
      } else if (totalMemoryBytes && totalMemoryBytes < 4 * 1024 * 1024 * 1024) {
        const hasShownLowMemoryWarning = await AsyncStorage.getItem('hasShownLowMemoryWarning');
        if (!hasShownLowMemoryWarning) {
          setMemoryWarningType('low_memory');
          setShowMemoryWarning(true);
        }
      }
    } catch (error) {
    }
  }, []);

  const handleMemoryWarningClose = useCallback(async () => {
    try {
      if (memoryWarningType === 'low_memory') {
        await AsyncStorage.setItem('hasShownLowMemoryWarning', 'true');
      } else if (memoryWarningType === 'very_low_memory') {
        await AsyncStorage.setItem('hasShownVeryLowMemoryWarning', 'true');
      }
      setShowMemoryWarning(false);
    } catch (error) {
    }
  }, [memoryWarningType]);

  return {
    showMemoryWarning,
    memoryWarningType,
    checkSystemMemory,
    handleMemoryWarningClose,
  };
};
