import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendEmailVerification,
  signInWithPopup,
  GithubAuthProvider,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  User,
  onAuthStateChanged,
  Auth,
  initializeAuth,
  getReactNativePersistence
} from 'firebase/auth';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const getSecureConfig = () => {
  const config = {
    apiKey: Constants.expoConfig?.extra?.firebaseApiKey,
    authDomain: Constants.expoConfig?.extra?.firebaseAuthDomain,
    projectId: Constants.expoConfig?.extra?.firebaseProjectId,
    storageBucket: Constants.expoConfig?.extra?.firebaseStorageBucket,
    messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId,
    appId: Constants.expoConfig?.extra?.firebaseAppId,
  };

  const missingConfigs = Object.entries(config)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingConfigs.length > 0) {
    throw new Error(
      `Missing Firebase configuration: ${missingConfigs.join(', ')}. ` +
      'Make sure you have set up the .env file correctly.'
    );
  }

  return config as Record<string, string>;
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

try {
  const firebaseConfig = getSecureConfig();
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  
  if (Platform.OS === 'web') {
    auth = getAuth(app);
  } else {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  }
} catch (error) {
  console.error('Error initializing Firebase:', error);
}

type UserData = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  lastLoginAt: string;
};

const USER_AUTH_KEY = 'inferra_secure_user_auth_state';
const AUTH_ATTEMPTS_KEY = 'inferra_secure_auth_attempts';
const MAX_AUTH_ATTEMPTS = 5;
const AUTH_LOCKOUT_DURATION = 15 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 8;

const storeAuthState = async (user: User | null): Promise<void> => {
  try {
    if (!user) {
      await SecureStore.deleteItemAsync(USER_AUTH_KEY);
      return;
    }

    const userData: UserData = {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      lastLoginAt: new Date().toISOString(),
    };

    await SecureStore.setItemAsync(USER_AUTH_KEY, JSON.stringify(userData));
  } catch (error) {
    console.error('Error storing auth state:', error);
    throw new Error('Authentication storage failed');
  }
};

const checkRateLimiting = async (): Promise<boolean> => {
  try {
    const attemptsData = await SecureStore.getItemAsync(AUTH_ATTEMPTS_KEY);
    
    if (!attemptsData) {
      return true;
    }
    
    const { attempts, timestamp } = JSON.parse(attemptsData);
    const now = Date.now();
    
    if (now - timestamp > AUTH_LOCKOUT_DURATION) {
      await SecureStore.deleteItemAsync(AUTH_ATTEMPTS_KEY);
      return true;
    }
    
    if (attempts >= MAX_AUTH_ATTEMPTS) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error checking rate limiting:', error);
    return true;
  }
};

const incrementAuthAttempts = async (): Promise<void> => {
  try {
    const attemptsData = await SecureStore.getItemAsync(AUTH_ATTEMPTS_KEY);
    const now = Date.now();
    
    if (!attemptsData) {
      await SecureStore.setItemAsync(
        AUTH_ATTEMPTS_KEY, 
        JSON.stringify({ attempts: 1, timestamp: now })
      );
      return;
    }
    
    const { attempts, timestamp } = JSON.parse(attemptsData);
    
    if (now - timestamp > AUTH_LOCKOUT_DURATION) {
      await SecureStore.setItemAsync(
        AUTH_ATTEMPTS_KEY, 
        JSON.stringify({ attempts: 1, timestamp: now })
      );
      return;
    }
    
    await SecureStore.setItemAsync(
      AUTH_ATTEMPTS_KEY, 
      JSON.stringify({ attempts: attempts + 1, timestamp })
    );
  } catch (error) {
    console.error('Error incrementing auth attempts:', error);
  }
};

const resetAuthAttempts = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(AUTH_ATTEMPTS_KEY);
  } catch (error) {
    console.error('Error resetting auth attempts:', error);
  }
};

const validateEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return email.length <= 320 && emailRegex.test(email);
};

const validatePassword = (password: string): { valid: boolean; message?: string } => {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }
  
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
  }
  
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  if (!(hasUpperCase && hasLowerCase && (hasNumbers || hasSpecialChars))) {
    return { 
      valid: false, 
      message: 'Password must include uppercase, lowercase, and numbers or special characters' 
    };
  }
  
  return { valid: true };
};

const validateName = (name: string): boolean => {
  if (!name || typeof name !== 'string') return false;
  
  if (name.length > 100) return false;
  
  const nameRegex = /^[a-zA-Z0-9\s\-'\.]+$/;
  return nameRegex.test(name);
};

export const registerWithEmail = async (
  name: string,
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!validateName(name)) {
      return { success: false, error: 'Invalid name format' };
    }
    
    if (!validateEmail(email)) {
      return { success: false, error: 'Invalid email format' };
    }
    
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return { success: false, error: passwordValidation.message };
    }
    
    const notRateLimited = await checkRateLimiting();
    if (!notRateLimited) {
      return { 
        success: false, 
        error: 'Too many attempts. Please try again later.' 
      };
    }
    
    if (!auth) {
      return { success: false, error: 'Firebase authentication not initialized' };
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    await updateProfile(user, { displayName: name });
    
    await sendEmailVerification(user);
    
    await storeAuthState(user);
    
    await resetAuthAttempts();
    
    return { success: true };
  } catch (error: any) {
    await incrementAuthAttempts();
    
    if (error.code === 'auth/email-already-in-use') {
      return { success: false, error: 'Email address is already in use' };
    } else if (error.code === 'auth/invalid-email') {
      return { success: false, error: 'Invalid email format' };
    } else if (error.code === 'auth/weak-password') {
      return { success: false, error: 'Password is too weak' };
    } else if (error.code === 'auth/network-request-failed') {
      return { success: false, error: 'Network error. Please check your connection.' };
    }
    
    return { 
      success: false, 
      error: 'Registration failed. Please try again.' 
    };
  }
};

export const loginWithEmail = async (
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!validateEmail(email)) {
      return { success: false, error: 'Invalid email format' };
    }
    
    if (!password || password.length < 1) {
      return { success: false, error: 'Password is required' };
    }
    
    const notRateLimited = await checkRateLimiting();
    if (!notRateLimited) {
      return { 
        success: false, 
        error: 'Too many attempts. Please try again later.' 
      };
    }
    
    if (!auth) {
      return { success: false, error: 'Firebase authentication not initialized' };
    }

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    await storeAuthState(user);
    
    await resetAuthAttempts();
    
    return { success: true };
  } catch (error: any) {
    await incrementAuthAttempts();
    
    if (error.code === 'auth/invalid-email') {
      return { success: false, error: 'Invalid email format' };
    } else if (error.code === 'auth/user-disabled') {
      return { success: false, error: 'This account has been disabled' };
    } else if (error.code === 'auth/network-request-failed') {
      return { success: false, error: 'Network error. Please check your connection.' };
    } else if (error.code === 'auth/too-many-requests') {
      return { success: false, error: 'Too many attempts. Please try again later.' };
    } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      return { success: false, error: 'Invalid email or password' };
    }
    
    return { 
      success: false, 
      error: 'Login failed. Please try again.' 
    };
  }
};

export const signInWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    if (Platform.OS !== 'web') {
      return { 
        success: false, 
        error: 'Google sign-in is not supported on this platform' 
      };
    }
    
    if (!auth) {
      return { success: false, error: 'Firebase authentication not initialized' };
    }

    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    
    const userCredential = await signInWithPopup(auth, provider);
    const user = userCredential.user;
    
    await storeAuthState(user);
    
    return { success: true };
  } catch (error: any) {
    console.error('Google sign-in error:', error);
    
    if (error.code === 'auth/popup-closed-by-user') {
      return { success: false, error: 'Sign-in canceled' };
    } else if (error.code === 'auth/popup-blocked') {
      return { success: false, error: 'Pop-up was blocked by your browser' };
    }
    
    return { 
      success: false, 
      error: 'Google sign-in failed. Please try again.' 
    };
  }
};

export const signInWithGithub = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    if (Platform.OS !== 'web') {
      return { 
        success: false, 
        error: 'GitHub sign-in is not supported on this platform' 
      };
    }
    
    if (!auth) {
      return { success: false, error: 'Firebase authentication not initialized' };
    }

    const provider = new GithubAuthProvider();
    provider.addScope('user');
    
    const userCredential = await signInWithPopup(auth, provider);
    const user = userCredential.user;
    
    await storeAuthState(user);
    
    return { success: true };
  } catch (error: any) {
    console.error('GitHub sign-in error:', error);
    
    if (error.code === 'auth/popup-closed-by-user') {
      return { success: false, error: 'Sign-in canceled' };
    } else if (error.code === 'auth/account-exists-with-different-credential') {
      return { 
        success: false, 
        error: 'An account already exists with the same email address but different sign-in credentials' 
      };
    }
    
    return { 
      success: false, 
      error: 'GitHub sign-in failed. Please try again.' 
    };
  }
};

export const logoutUser = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!auth) {
      return { success: false, error: 'Firebase authentication not initialized' };
    }

    await signOut(auth);
    await storeAuthState(null);
    return { success: true };
  } catch (error) {
    console.error('Logout error:', error);
    return { 
      success: false, 
      error: 'Failed to log out. Please try again.' 
    };
  }
};

export const getCurrentUser = (): User | null => {
  return auth ? auth.currentUser : null;
};

export const isAuthenticated = async (): Promise<boolean> => {
  if (!auth) return false;
  
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      unsubscribe();
      resolve(!!user);
    });
  });
};

export const getUserFromSecureStorage = async (): Promise<UserData | null> => {
  try {
    const userData = await SecureStore.getItemAsync(USER_AUTH_KEY);
    if (!userData) {
      return null;
    }
    
    const parsed = JSON.parse(userData);
    if (!parsed.uid) {
      await SecureStore.deleteItemAsync(USER_AUTH_KEY);
      return null;
    }
    
    return parsed;
  } catch (error) {
    console.error('Error getting user from secure storage:', error);
    await SecureStore.deleteItemAsync(USER_AUTH_KEY);
    return null;
  }
}; 