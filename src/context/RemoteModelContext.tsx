import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthenticated, getCurrentUser, isFirebaseReady } from '../services/FirebaseAuth';
import { getUserFromSecureStorage } from '../services/AuthStorage';
import { getFirebaseServices } from '../services/FirebaseService';
import { onAuthStateChanged, FirebaseAuthTypes } from '@react-native-firebase/auth';

interface RemoteModelContextType {
  enableRemoteModels: boolean;
  toggleRemoteModels: () => Promise<{ success: boolean, requiresLogin?: boolean, emailNotVerified?: boolean }>;
  isLoggedIn: boolean;
  checkLoginStatus: () => Promise<boolean>;
  disableRemoteModels: () => Promise<void>;
}

const RemoteModelContext = createContext<RemoteModelContextType>({
  enableRemoteModels: false,
  toggleRemoteModels: async () => ({ success: false }),
  isLoggedIn: false,
  checkLoginStatus: async () => false,
  disableRemoteModels: async () => {},
});

export const RemoteModelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [enableRemoteModels, setEnableRemoteModels] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  const disableRemoteModels = async (): Promise<void> => {
    setEnableRemoteModels(false);
    try {
      await AsyncStorage.setItem('@remote_models_enabled', 'false');
    } catch {
      // do nothing
    }
  };

  const checkLoginStatus = useCallback(async () => {
    try {
      if (!isFirebaseReady()) {
        setIsLoggedIn(false);
        return false;
      }

      const authenticated = await isAuthenticated();
      setIsLoggedIn(authenticated);
      
      if (!authenticated) {
        const userData = await getUserFromSecureStorage();
        const isLoggedInFromStorage = !!userData;
        setIsLoggedIn(isLoggedInFromStorage);
        
        if (!isLoggedInFromStorage) {
          await disableRemoteModels();
        }
        
        return isLoggedInFromStorage;
      }
      
      return authenticated;
    } catch {
      setIsLoggedIn(false);
      await disableRemoteModels();
      return false;
    }
  }, []);

  useEffect(() => {
    loadRemoteModelPreference();
    checkLoginStatus();
    
    if (!isFirebaseReady()) {
      return;
    }

    try {
      const { auth } = getFirebaseServices();
      if (!auth) {
        return;
      }

      const unsubscribe = onAuthStateChanged(auth(), async (user: FirebaseAuthTypes.User | null) => {
        const newLoginState = !!user;
        setIsLoggedIn(newLoginState);
        
        if (!newLoginState) {
          await disableRemoteModels();
        }
      });

      return () => unsubscribe();
    } catch {
      
    }
  }, [checkLoginStatus]);

  const loadRemoteModelPreference = async () => {
    try {
      const savedPreference = await AsyncStorage.getItem('@remote_models_enabled');
      if (savedPreference) {
        setEnableRemoteModels(savedPreference === 'true');
      }
    } catch {
      // do nothing
    }
  };

  const toggleRemoteModels = async () => {
    if (!enableRemoteModels) {
      const isUserLoggedIn = await checkLoginStatus();
      if (!isUserLoggedIn) {
        return { success: false, requiresLogin: true };
      }
      
      const user = getCurrentUser();
      if (user && !user.emailVerified) {
        return { success: false, emailNotVerified: true };
      }
    }
    
    const newValue = !enableRemoteModels;
    setEnableRemoteModels(newValue);
    try {
      await AsyncStorage.setItem('@remote_models_enabled', newValue.toString());
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  return (
    <RemoteModelContext.Provider value={{ 
      enableRemoteModels,
      toggleRemoteModels,
      isLoggedIn,
      checkLoginStatus,
      disableRemoteModels
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