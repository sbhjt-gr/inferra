import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { 
  getCurrentUser, 
  getUserFromSecureStorage, 
  isAuthenticated, 
  initAuthState,
  storeAuthState
} from '../services/FirebaseService';
import { networkService } from '../services/NetworkService';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOnline: boolean;
  hasOfflineData: boolean;
  refreshAuthState: () => Promise<void>;
  logout: () => Promise<void>;
  checkLoginStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isOnline: true,
  hasOfflineData: false,
  refreshAuthState: async () => {},
  logout: async () => {},
  checkLoginStatus: async () => false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [hasOfflineData, setHasOfflineData] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    initializeAuth();
    setupNetworkListener();
    setupAppStateListener();
    
    return () => {
      cleanup();
    };
  }, []);

  const initializeAuth = async () => {
    try {
      setIsLoading(true);
      
      const auth = getAuth();
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        try {
          if (firebaseUser) {
            setUser(firebaseUser);
            setIsAuthenticated(true);
            await storeAuthState(firebaseUser);
          } else {
            const offlineUser = await getUserFromSecureStorage();
            if (offlineUser) {
              setHasOfflineData(true);
              setIsAuthenticated(true);
            } else {
              setUser(null);
              setIsAuthenticated(false);
              setHasOfflineData(false);
            }
          }
        } catch (error) {
          console.error('Error in auth state change:', error);
          await handleOfflineAuth();
        } finally {
          setIsLoading(false);
        }
      });

      const initialUser = await initAuthState();
      if (!initialUser) {
        await handleOfflineAuth();
      }
      
      return unsubscribe;
    } catch (error) {
      console.error('Error initializing auth:', error);
      await handleOfflineAuth();
      setIsLoading(false);
    }
  };

  const handleOfflineAuth = async () => {
    try {
      const offlineUser = await getUserFromSecureStorage();
      if (offlineUser) {
        setHasOfflineData(true);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setHasOfflineData(false);
      }
    } catch (error) {
      console.error('Error handling offline auth:', error);
      setUser(null);
      setIsAuthenticated(false);
      setHasOfflineData(false);
    }
  };

  const setupNetworkListener = () => {
    const unsubscribe = networkService.addNetworkStateListener((online) => {
      setIsOnline(online);
      if (online) {
        refreshAuthState();
      }
    });
    
    setIsOnline(networkService.getNetworkState());
    
    return unsubscribe;
  };

  const setupAppStateListener = () => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        await refreshAuthState();
        await networkService.checkNetworkState();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  };

  const refreshAuthState = async () => {
    try {
      if (isOnline) {
        const currentUser = getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          setIsAuthenticated(true);
          await storeAuthState(currentUser);
        } else {
          const authState = await isAuthenticated();
          if (!authState) {
            await handleOfflineAuth();
          }
        }
      } else {
        await handleOfflineAuth();
      }
    } catch (error) {
      console.error('Error refreshing auth state:', error);
      await handleOfflineAuth();
    }
  };

  const logout = async () => {
    try {
      const { logoutUser } = await import('../services/FirebaseService');
      await logoutUser();
      setUser(null);
      setIsAuthenticated(false);
      setHasOfflineData(false);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  const checkLoginStatus = async (): Promise<boolean> => {
    try {
      await refreshAuthState();
      return isAuthenticated || hasOfflineData;
    } catch (error) {
      return false;
    }
  };

  const cleanup = () => {
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated,
      isOnline,
      hasOfflineData,
      refreshAuthState,
      logout,
      checkLoginStatus,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 