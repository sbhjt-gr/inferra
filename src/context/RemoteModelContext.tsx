import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { isAuthenticated, getCurrentUser, isFirebaseReady, onAuthStateChange } from '../services/FirebaseAuth';
import { getUserFromSecureStorage } from '../services/AuthStorage';
import { User as FirebaseUser } from 'firebase/auth';
import providerKeyStorage from '../utils/ProviderKeyStorage';

const REMOTE_MODELS_KEY = 'remote_models_enabled';

interface RemoteModelContextType {
  enableRemoteModels: boolean;
  toggleRemoteModels: () => Promise<{ success: boolean, requiresLogin?: boolean, emailNotVerified?: boolean }>;
  isLoggedIn: boolean;
  checkLoginStatus: () => Promise<boolean>;
  disableRemoteModels: (persist?: boolean) => Promise<void>;
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

  const loadPref = useCallback(async () => {
    try {
      await providerKeyStorage.initialize();
      const saved = await providerKeyStorage.getPreference(REMOTE_MODELS_KEY);
      if (saved !== null) {
        setEnableRemoteModels(saved === 'true');
      }
    } catch {
    }
  }, []);

  const setPref = useCallback(async (val: boolean, persist: boolean): Promise<boolean> => {
    setEnableRemoteModels(val);
    if (!persist) {
      return true;
    }
    try {
      await providerKeyStorage.initialize();
      await providerKeyStorage.setPreference(REMOTE_MODELS_KEY, val ? 'true' : 'false');
      return true;
    } catch {
      return false;
    }
  }, []);

  const disableRemoteModels = useCallback(async (persist: boolean = true): Promise<void> => {
    await setPref(false, persist);
  }, [setPref]);

  const checkLoginStatus = useCallback(async () => {
    try {
      if (!isFirebaseReady()) {
        setIsLoggedIn(false);
        return false;
      }

      const authenticated = await isAuthenticated();
      setIsLoggedIn(authenticated);

      if (!authenticated) {
        const storedUser = await getUserFromSecureStorage();
        const logged = !!storedUser;
        setIsLoggedIn(logged);

        if (!logged) {
          await disableRemoteModels(false);
          return false;
        }

        await loadPref();
        return true;
      }

      await loadPref();
      return true;
    } catch {
      setIsLoggedIn(false);
      await disableRemoteModels(false);
      return false;
    }
  }, [disableRemoteModels, loadPref]);

  useEffect(() => {
    loadPref();
    checkLoginStatus();

    if (!isFirebaseReady()) {
      return;
    }

    try {
      const unsubscribe = onAuthStateChange(async (user: FirebaseUser | null) => {
        const logged = !!user;
        setIsLoggedIn(logged);

        if (!logged) {
          await disableRemoteModels(false);
          return;
        }

        await loadPref();
      });

      return () => unsubscribe();
    } catch {
      
    }
  }, [checkLoginStatus, disableRemoteModels, loadPref]);

  const toggleRemoteModels = async () => {
    if (!enableRemoteModels) {
      const logged = await checkLoginStatus();
      if (!logged) {
        return { success: false, requiresLogin: true };
      }

      const user = getCurrentUser();
      if (user && !user.emailVerified) {
        return { success: false, emailNotVerified: true };
      }
    }

    const next = !enableRemoteModels;
    const ok = await setPref(next, true);
    return { success: ok };
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
