import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser } from '../services/FirebaseService';
import { useAuth } from './AuthContext';

interface RemoteModelContextType {
  enableRemoteModels: boolean;
  toggleRemoteModels: () => Promise<{ success: boolean, requiresLogin?: boolean, emailNotVerified?: boolean }>;
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
  const { isAuthenticated, user, isOnline, hasOfflineData } = useAuth();

  useEffect(() => {
    loadRemoteModelPreference();
  }, []);

  useEffect(() => {
    if (!isAuthenticated && enableRemoteModels) {
      setEnableRemoteModels(false);
      AsyncStorage.setItem('@remote_models_enabled', 'false')
        .catch(error => console.error('Error saving remote model preference:', error));
    }
  }, [isAuthenticated, enableRemoteModels]);

  const loadRemoteModelPreference = async () => {
    try {
      const savedPreference = await AsyncStorage.getItem('@remote_models_enabled');
      if (savedPreference) {
        const shouldEnable = savedPreference === 'true';
        setEnableRemoteModels(shouldEnable);
      }
    } catch (error) {
    }
  };

  const checkLoginStatus = async () => {
    return isAuthenticated || hasOfflineData;
  };

  const toggleRemoteModels = async () => {
    if (!enableRemoteModels) {
      const isUserLoggedIn = await checkLoginStatus();
      if (!isUserLoggedIn) {
        return { success: false, requiresLogin: true };
      }
      
      const currentUser = getCurrentUser();
      if (currentUser && !currentUser.emailVerified) {
        return { success: false, emailNotVerified: true };
      }
      
      if (!isOnline && !hasOfflineData) {
        return { success: false, requiresLogin: true };
      }
    }
    
    const newValue = !enableRemoteModels;
    setEnableRemoteModels(newValue);
    try {
      await AsyncStorage.setItem('@remote_models_enabled', newValue.toString());
      return { success: true };
    } catch (error) {
      return { success: false };
    }
  };

  return (
    <RemoteModelContext.Provider value={{ 
      enableRemoteModels,
      toggleRemoteModels,
      isLoggedIn: isAuthenticated,
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