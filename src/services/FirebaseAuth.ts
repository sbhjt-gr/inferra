import Constants from 'expo-constants';
import { 
  signInWithCredential, 
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  Timestamp,
  collection,
  addDoc 
} from 'firebase/firestore';
import { auth, firestore } from '../config/firebase';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { 
  checkRateLimiting, 
  incrementAuthAttempts, 
  resetAuthAttempts,
  isEmailFromTrustedProvider,
  getIpAddress,
  getGeoLocationFromIp,
  getDeviceInfo,
  storeUserSecurityInfo
} from './SecurityUtils';
import { storeAuthState } from './AuthStorage';

export type UserData = {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  photoURL: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  lastLoginAt?: Timestamp;
  trustedEmail?: boolean;
  lastLoginInfo?: any;
  settings?: any;
  status?: any;
  registrationInfo?: any;
};

WebBrowser.maybeCompleteAuthSession();

const redirectUri = AuthSession.makeRedirectUri();

let isFirebaseInitialized = false;

export const isFirebaseReady = (): boolean => {
  return isFirebaseInitialized;
};

export const initializeFirebase = async (): Promise<void> => {
  if (isFirebaseInitialized) return;

  const extra = Constants.expoConfig?.extra;
  
  if (!extra?.GOOGLE_SIGN_IN_WEB_CLIENT_ID) {
    throw new Error('Google Sign-In Web Client ID not configured');
  }
  
  isFirebaseInitialized = true;
};

export const waitForAuthReady = (): Promise<FirebaseUser | null> => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

export const getCurrentUser = (): FirebaseUser | null => {
  return auth.currentUser;
};

export const isAuthenticated = (): boolean => {
  return !!auth.currentUser;
};

export const onAuthStateChange = (callback: (user: FirebaseUser | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

export const registerWithEmail = async (
  email: string, 
  password: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await storeAuthState(user);
    return { success: true };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message || 'Registration failed. Please try again.' 
    };
  }
};

export const loginWithEmail = async (
  email: string, 
  password: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await storeAuthState(user);
    return { success: true };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message || 'Login failed. Please try again.' 
    };
  }
};

export const signInWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const extra = Constants.expoConfig?.extra;
    const clientId = extra?.GOOGLE_SIGN_IN_WEB_CLIENT_ID;
    
    if (!clientId) {
      throw new Error('Google Sign-In Web Client ID not configured');
    }

    const request = new AuthSession.AuthRequest({
      clientId: clientId,
      scopes: ['openid', 'profile', 'email'],
      redirectUri: redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      extraParams: {
        nonce: Math.random().toString(36).substring(2),
      },
    });

    const result = await request.promptAsync({
      authorizationEndpoint: 'https://accounts.google.com/oauth2/auth',
    });

    if (result.type !== 'success' || !result.params.id_token) {
      return { 
        success: false, 
        error: result.type === 'cancel' ? 'Sign-in was cancelled' : 'Failed to get authentication' 
      };
    }

    const googleCredential = GoogleAuthProvider.credential(result.params.id_token);
    const userCredential = await signInWithCredential(auth, googleCredential);
    const user = userCredential.user;
    
    await storeAuthState(user);
    return { success: true };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message || 'Google sign-in failed. Please try again.' 
    };
  }
};

export const logoutUser = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    await signOut(auth);
    await storeAuthState(null);
    return { success: true };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message || 'Logout failed.' 
    };
  }
};

export const sendVerificationEmail = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'No user logged in' };
    }
    
    await sendEmailVerification(user);
    return { success: true };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message || 'Failed to send verification email.' 
    };
  }
};

export const getUserProfile = async (uid: string): Promise<UserData | null> => {
  try {
    const userDocRef = doc(firestore, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      return userDoc.data() as UserData;
    }
    
    return null;
  } catch (error) {
    return null;
  }
};
