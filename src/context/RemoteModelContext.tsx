import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthenticated, getUserFromSecureStorage, getCurrentUser, isFirebaseReady, getFirebaseServices } from '../services/FirebaseService';
import { onAuthStateChanged } from 'firebase/auth';

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
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

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

      const unsubscribe = onAuthStateChanged(auth, (user) => {
        const newLoginState = !!user;
        setIsLoggedIn(newLoginState);
        
        if (!newLoginState && enableRemoteModels) {
          setEnableRemoteModels(false);
          AsyncStorage.setItem('@remote_models_enabled', 'false')
            .catch(error => console.error('Error saving remote model preference:', error));
        }
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Error setting up auth state listener:', error);
    }
  }, [enableRemoteModels]);

  const loadRemoteModelPreference = async () => {
    try {
      const savedPreference = await AsyncStorage.getItem('@remote_models_enabled');
      if (savedPreference) {
        setEnableRemoteModels(savedPreference === 'true');
      }
    } catch (error) {
      // do nothing
    }
  };

  const checkLoginStatus = async () => {
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
        return isLoggedInFromStorage;
      }
      
      return authenticated;
    } catch (error) {
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
    } catch (error) {
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