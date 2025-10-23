import Constants from 'expo-constants';
import {
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
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
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
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

type GoogleSignInResult = {
  idToken?: string | null;
  user?: {
    email?: string | null;
  };
};

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address looks incorrect. Please check and try again.',
  'auth/user-disabled': 'This account is disabled. Contact support for help.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/email-already-in-use': 'This email is already registered. Try signing in instead.',
  'auth/weak-password': 'Your password is too weak. Use at least six characters.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
  'auth/missing-email': 'Enter an email address to continue.',
  'auth/internal-error': 'Something went wrong. Please try again.'
};

const mapAuthError = (error: any, fallback: string) => {
  const code = typeof error?.code === 'string' ? error.code : undefined;
  if (code && AUTH_ERROR_MESSAGES[code]) {
    return AUTH_ERROR_MESSAGES[code];
  }
  if (typeof error?.message === 'string') {
    const entry = Object.keys(AUTH_ERROR_MESSAGES).find(key => error.message.includes(key));
    if (entry) {
      return AUTH_ERROR_MESSAGES[entry];
    }
  }
  return fallback;
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
      error: mapAuthError(error, 'Registration failed. Please try again.')
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
      error: mapAuthError(error, 'Login failed. Please try again.')
    };
  }
};

export const signInWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    await GoogleSignin.hasPlayServices();

    if (__DEV__) {
      console.log('native_google_sign_in_start');
    }

  const userInfo = (await GoogleSignin.signIn()) as GoogleSignInResult;

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
      errorMessage = AUTH_ERROR_MESSAGES['auth/network-request-failed'];
    } else if (typeof error?.code === 'string' && AUTH_ERROR_MESSAGES[error.code]) {
      errorMessage = AUTH_ERROR_MESSAGES[error.code];
    }

    return {
      success: false,
      error: errorMessage
    };
  }
};

const generateSecureRandomString = async (length = 32) => {
  const size = Math.ceil(length / 2);
  const bytes = await Crypto.getRandomBytesAsync(size);
  let result = '';
  for (let i = 0; i < bytes.length; i += 1) {
    result += bytes[i].toString(16).padStart(2, '0');
  }
  return result.slice(0, length);
};

export const signInWithApple = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      return {
        success: false,
        error: 'Apple Sign-In is not available on this device'
      };
    }

    if (__DEV__) {
      console.log('apple_sign_in_start');
    }

    const rawNonce = await generateSecureRandomString(32);
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    if (__DEV__) {
      console.log('apple_sign_in_nonce_generated', {
        rawNonceLength: rawNonce.length,
        hashedNonceLength: hashedNonce.length
      });
    }

    const appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL
      ],
      nonce: hashedNonce
    });

    if (__DEV__) {
      console.log('apple_sign_in_credential_received', {
        hasIdentityToken: !!appleCredential.identityToken,
        hasEmail: !!appleCredential.email,
        hasFullName: !!appleCredential.fullName
      });
    }

    if (!appleCredential.identityToken) {
      return {
        success: false,
        error: 'Apple did not return an identity token'
      };
    }

    const provider = new OAuthProvider('apple.com');
    const firebaseCredential = provider.credential({
      idToken: appleCredential.identityToken,
      rawNonce
    });

    if (__DEV__) {
      console.log('apple_sign_in_firebase_credential_created');
    }

    const userCredential = await signInWithCredential(auth, firebaseCredential);
    const user = userCredential.user;

    if (__DEV__) {
      console.log('apple_sign_in_firebase_success', { uid: user.uid });
    }

    if (appleCredential.fullName) {
      const given = appleCredential.fullName.givenName || '';
      const family = appleCredential.fullName.familyName || '';
      const displayName = `${given} ${family}`.trim();
      if (displayName && user.displayName !== displayName) {
        await updateProfile(user, { displayName });
      }
    }

    await storeAuthState(user);

    return { success: true };
  } catch (error: any) {
    if (__DEV__) {
      console.error('native_apple_sign_in_error', error);
      console.error('apple_sign_in_error_details', {
        code: error?.code,
        message: error?.message,
        name: error?.name
      });
    }

    let errorMessage = 'Apple sign-in failed. Please try again.';

    if (error?.code === 'ERR_REQUEST_CANCELED' || error?.code === 'ERR_CANCELED') {
      errorMessage = 'Sign-in was cancelled';
    } else if (error?.message?.includes('authorization attempt failed')) {
      errorMessage = 'Apple Sign-In is not properly configured. Please ensure Apple Sign-In capability is enabled in your Apple Developer account.';
    } else if (typeof error?.code === 'string' && AUTH_ERROR_MESSAGES[error.code]) {
      errorMessage = AUTH_ERROR_MESSAGES[error.code];
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
      error: mapAuthError(error, 'Logout failed.')
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
      error: mapAuthError(error, 'Failed to send verification email.')
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
