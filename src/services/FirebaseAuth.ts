import Constants from 'expo-constants';
import {
  signInWithCredential,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile,
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
import { GoogleSignin } from '@react-native-google-signin/google-signin';
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

  GoogleSignin.configure({
    webClientId: extra.GOOGLE_SIGN_IN_WEB_CLIENT_ID,
    iosClientId: extra.GOOGLE_SIGN_IN_IOS_CLIENT_ID,
    offlineAccess: true,
    hostedDomain: '',
    forceCodeForRefreshToken: true,
  });

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
  name: string,
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (name) {
      await updateProfile(user, {
        displayName: name
      });
    }

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
    await GoogleSignin.hasPlayServices();

    if (__DEV__) {
      console.log('native_google_sign_in_start');
    }

    const userInfo = await GoogleSignin.signIn();

    if (__DEV__) {
      console.log('google_signin_userInfo', {
        hasIdToken: !!userInfo.idToken,
        hasUser: !!userInfo.user,
        email: userInfo.user?.email
      });
    }

    let idToken = userInfo.idToken;

    if (!idToken) {
      if (__DEV__) {
        console.log('attempting_to_get_tokens_silently');
      }

      const tokens = await GoogleSignin.getTokens();
      idToken = tokens.idToken;

      if (__DEV__) {
        console.log('silent_tokens', { hasIdToken: !!tokens.idToken });
      }
    }

    if (!idToken) {
      return {
        success: false,
        error: 'No ID token received from Google'
      };
    }

    const googleCredential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, googleCredential);
    const user = userCredential.user;

    await storeAuthState(user);

    if (__DEV__) {
      console.log('native_google_sign_in_success', { uid: user.uid });
    }

    return { success: true };
  } catch (error: any) {
    if (__DEV__) {
      console.error('native_google_sign_in_error', error);
    }

    let errorMessage = 'Google sign-in failed. Please try again.';

    if (error.code === 'SIGN_IN_CANCELLED') {
      errorMessage = 'Sign-in was cancelled';
    } else if (error.code === 'IN_PROGRESS') {
      errorMessage = 'Sign-in already in progress';
    } else if (error.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
      errorMessage = 'Google Play Services not available';
    } else if (error.code === 'auth/network-request-failed') {
      errorMessage = 'Network error. Please check your connection.';
    }

    return {
      success: false,
      error: errorMessage
    };
  }
};

export const logoutUser = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    await GoogleSignin.signOut();
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
