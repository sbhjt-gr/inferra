import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type UserData = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  lastLoginAt: string;
  createdAt?: any;
  updatedAt?: any;
  trustedEmail?: boolean;
  settings?: any;
  status?: any;
  registrationInfo?: any;
  lastLoginInfo?: any;
};

export const USER_AUTH_KEY = 'inferra_secure_user_auth_state';

export const storeAuthState = async (user: FirebaseAuthTypes.User | null, profileData?: any): Promise<boolean> => {
  try {
    if (!user) {
      await AsyncStorage.removeItem(USER_AUTH_KEY);
      return true;
    }

    let userData: UserData = {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      lastLoginAt: new Date().toISOString(),
    };

    if (profileData) {
      userData = {
        ...userData,
        ...profileData,
        emailVerified: user.emailVerified,
        lastLoginAt: profileData.lastLoginAt || userData.lastLoginAt,
      };
    }

    await AsyncStorage.setItem(USER_AUTH_KEY, JSON.stringify(userData));
    return true;
  } catch (error) {
    if (__DEV__) {
    }
    return false;
  }
};

export const getUserFromSecureStorage = async (): Promise<UserData | null> => {
  try {
    const userData = await AsyncStorage.getItem(USER_AUTH_KEY);
    
    if (!userData) {
      return null;
    }
    
    const parsed = JSON.parse(userData);
    if (!parsed.uid) {
      await AsyncStorage.removeItem(USER_AUTH_KEY);
      return null;
    }
    
    try {
      const { getFirebaseServices } = await import('./FirebaseService');
      const { auth } = getFirebaseServices();
      const currentUser = auth().currentUser;
      
      if (currentUser && currentUser.uid === parsed.uid) {
        try {
          await currentUser.reload();
        } catch {
        }
        
        if (parsed.emailVerified !== currentUser.emailVerified) {
          parsed.emailVerified = currentUser.emailVerified;
          await AsyncStorage.setItem(USER_AUTH_KEY, JSON.stringify(parsed));
        }
      }
    } catch {
    }
    
    return parsed;
  } catch {
    await AsyncStorage.removeItem(USER_AUTH_KEY);
    return null;
  }
}; 
