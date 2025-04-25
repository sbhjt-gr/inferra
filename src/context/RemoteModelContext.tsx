import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface RemoteModelContextType {
  enableRemoteModels: boolean;
  toggleRemoteModels: () => Promise<{ success: boolean, requiresLogin?: boolean }>;
  isLoggedIn: boolean;
  checkLoginStatus: () => Promise<boolean>;
}

const RemoteModelContext = createContext<RemoteModelContextType>({
  enableRemoteModels: false,
  toggleRemoteModels: async () => ({ success: false }),
  isLoggedIn: false,
  checkLoginStatus: async () => false,
});

export const RemoteModelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [enableRemoteModels, setEnableRemoteModels] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  useEffect(() => {
    loadRemoteModelPreference();
    checkLoginStatus();
  }, []);

  const loadRemoteModelPreference = async () => {
    try {
      const savedPreference = await AsyncStorage.getItem('@remote_models_enabled');
      if (savedPreference) {
        setEnableRemoteModels(savedPreference === 'true');
      }
    } catch (error) {
      console.error('Error loading remote model preference:', error);
    }
  };

  const checkLoginStatus = async () => {
    try {
      const userJson = await AsyncStorage.getItem('user');
      if (userJson) {
        const user = JSON.parse(userJson);
        setIsLoggedIn(true);
        return true;
      } else {
        setIsLoggedIn(false);
        return false;
      }
    } catch (error) {
      console.error('Error checking login status:', error);
      setIsLoggedIn(false);
      return false;
    }
  };

  const toggleRemoteModels = async () => {
    if (!enableRemoteModels) {
      const isUserLoggedIn = await checkLoginStatus();
      if (!isUserLoggedIn) {
        return { success: false, requiresLogin: true };
      }
    }
    
    const newValue = !enableRemoteModels;
    setEnableRemoteModels(newValue);
    try {
      await AsyncStorage.setItem('@remote_models_enabled', newValue.toString());
      return { success: true };
    } catch (error) {
      console.error('Error saving remote model preference:', error);
      return { success: false };
    }
  };

  return (
    <RemoteModelContext.Provider value={{ 
      enableRemoteModels,
      toggleRemoteModels,
      isLoggedIn,
      checkLoginStatus
    }}>
      {children}
    </RemoteModelContext.Provider>
  );
};

export const useRemoteModel = () => {
  const context = useContext(RemoteModelContext);
  if (!context) {
    throw new Error('useRemoteModel must be used within a RemoteModelProvider');
  }
  return context;
}; 