import { 
  signOut, 
  onAuthStateChanged, 
  FirebaseAuthTypes 
} from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthInstance } from './FirebaseInstances';
import { 
  UserData, 
  storeAuthState, 
  getUserFromSecureStorage 
} from './AuthStorage';
import { 
  getUserProfile, 
  updateEmailVerificationStatus
} from './UserProfile';
import { isFirebaseReady } from './FirebaseConfig';

export const logoutUser = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    await signOut(getAuthInstance());
    
    try {
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
    } catch {
      
    }
    
    await storeAuthState(null);
    
    try {
      await AsyncStorage.setItem('@remote_models_enabled', 'false');
    } catch {
      
    }
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: 'Failed to log out. Please try again.' 
    };
  }
};

export const getCurrentUser = (): FirebaseAuthTypes.User | null => {
  try {
    if (!isFirebaseReady()) {
      return null;
    }
    return getAuthInstance().currentUser;
  } catch (error) {
    if (__DEV__) {
      console.error('Error getting current user:', error);
    }
    return null;
  }
};

export const isAuthenticated = async (): Promise<boolean> => {
  try {
    if (!isFirebaseReady()) {
      return false;
    }
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(getAuthInstance(), (user: FirebaseAuthTypes.User | null) => {
        unsubscribe();
        resolve(!!user);
      });
    });
  } catch (error) {
    if (__DEV__) {
      console.error('Error checking authentication status:', error);
    }
    return false;
  }
};

export const initializeAuthAndSync = async (): Promise<{ user: FirebaseAuthTypes.User | null; profile: UserData | null }> => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return { user: null, profile: null };
    }
    
    try {
      await currentUser.reload();
    } catch (error) {
      
    }
    
      await updateEmailVerificationStatus(currentUser.uid, currentUser.emailVerified);
    
    const profileData = await getUserProfile(currentUser.uid);
    if (profileData) {
      profileData.emailVerified = currentUser.emailVerified;
      await storeAuthState(currentUser, profileData);
    } else {
      await storeAuthState(currentUser);
    }
    
    return { user: currentUser, profile: profileData };
  } catch {
    return { user: null, profile: null };
  }
};

export const initAuthState = async (): Promise<{ user: FirebaseAuthTypes.User | null; profile: UserData | null }> => {
  try {
    const currentUser = getAuthInstance().currentUser;
    if (currentUser) {
      try {
        await currentUser.reload();
      } catch {
        
      }
      
      const profileData = await getUserProfile(currentUser.uid);
      if (profileData) {
        await storeAuthState(currentUser, profileData);
      }
      return { user: currentUser, profile: profileData };
    }
    
    const storedUser = await getUserFromSecureStorage();
    if (!storedUser) return { user: null, profile: null };
    
          return await new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(getAuthInstance(), async (user: FirebaseAuthTypes.User | null) => {
          unsubscribe();
        if (user) {
          try {
            await user.reload();
          } catch (error) {
            
          }
          
          const profileData = await getUserProfile(user.uid);
          if (profileData) {
            await storeAuthState(user, profileData);
          }
          resolve({ user, profile: profileData });
        } else {
          resolve({ user: null, profile: null });
        }
      });
    });
  } catch (error) {
    if (__DEV__) {
      console.error('Error initializing auth state:', error);
    }
    return { user: null, profile: null };
  }
};

export const refreshUserProfile = async (): Promise<UserData | null> => {
  const currentUser = getCurrentUser();
  if (!currentUser) return null;
  
  try {
    await currentUser.reload();
  } catch (error) {
    
  }
  
  const profileData = await getUserProfile(currentUser.uid);
  if (profileData) {
    await storeAuthState(currentUser, profileData);
  }
  
  return profileData;
};

export const getCompleteUserData = async (forceRefresh = false): Promise<{
  user: FirebaseAuthTypes.User | null;
  profile: UserData | null;
  isAuthenticated: boolean;
}> => {
  try {
    const currentUser = getCurrentUser();
    
    if (!currentUser) {
      const storedProfile = await getUserFromSecureStorage();
      return {
        user: null,
        profile: storedProfile,
        isAuthenticated: false
      };
    }

    try {
      await currentUser.reload();
    } catch (error) {
      
    }

    let profileData = await getUserFromSecureStorage();
    
    if (forceRefresh || !profileData || profileData.uid !== currentUser.uid) {
      try {
        profileData = await getUserProfile(currentUser.uid);
        if (profileData) {
          await storeAuthState(currentUser, profileData);
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed to fetch fresh profile data, using stored data:', error);
        }
        if (!profileData) {
          profileData = await getUserFromSecureStorage();
        }
      }
    }
    
    if (profileData && profileData.emailVerified !== currentUser.emailVerified) {
      try {
        await updateEmailVerificationStatus(currentUser.uid, currentUser.emailVerified);
        profileData.emailVerified = currentUser.emailVerified;
        await storeAuthState(currentUser, profileData);
      } catch (error) {
        profileData.emailVerified = currentUser.emailVerified;
      }
    }

    return {
      user: currentUser,
      profile: profileData,
      isAuthenticated: true
    };
  } catch (error) {
    if (__DEV__) {
      console.error('Error getting complete user data:', error);
    }
    return {
      user: null,
      profile: null,
      isAuthenticated: false
    };
  }
};

export const forceRefreshUserData = async (): Promise<{
  user: FirebaseAuthTypes.User | null;
  profile: UserData | null;
  isAuthenticated: boolean;
}> => {
  return getCompleteUserData(true);
}; 