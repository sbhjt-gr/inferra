import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendEmailVerification,
  signOut,
  updateProfile,
  User,
  onAuthStateChanged,
  Auth
} from 'firebase/auth';
import {
  initializeAuth,
  getReactNativePersistence
} from 'firebase/auth/react-native';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

const getSecureConfig = () => {
  try {
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
      console.error('Missing Firebase configuration keys:', missingConfigs);
      throw new Error(
        `Firebase configuration is incomplete. Missing: ${missingConfigs.join(', ')}. Check your environment variables.`
      );
    }

    console.log('Firebase configuration loaded successfully');
    return config as Record<string, string>;
  } catch (error) {
    console.error('Firebase configuration error. Check environment setup.');
    console.error('Available config:', Constants.expoConfig?.extra);
    throw new Error('Firebase initialization failed. Contact support if the issue persists.');
  }
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let firestore: any = undefined;
let isFirebaseInitialized = false;

const initializeFirebase = () => {
  if (isFirebaseInitialized) {
    return { app, auth, firestore };
  }

  try {
    const firebaseConfig = getSecureConfig();
    
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
    
    firestore = getFirestore(app);
    isFirebaseInitialized = true;
    
    return { app, auth, firestore };
  } catch (error) {
    console.error('Error initializing Firebase services. Please try again later.');
    throw error;
  }
};

try {
  initializeFirebase();
} catch (error) {
  console.error('Error initializing Firebase services. Please try again later.');
}

export const getFirebaseServices = () => {
  if (!isFirebaseInitialized) {
    return initializeFirebase();
  }
  return { app, auth, firestore };
};

export const isFirebaseReady = () => isFirebaseInitialized;

const getIpAddress = async (): Promise<{ip: string | null, error?: string}> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    if (response.ok) {
      const data = await response.json();
      return { ip: data.ip };
    } else {
      return { ip: null, error: 'Failed to fetch IP address' };
    }
  } catch (error) {
    return { ip: null, error: 'Network error when fetching IP' };
  }
};

const getGeoLocationFromIp = async (ip: string): Promise<{geo: any | null, error?: string}> => {
  try {
    const response = await fetch(`https://ipinfo.io/${ip}/json`);
    if (response.ok) {
      const data = await response.json();
      const geoData = {
        city: data.city,
        region: data.region,
        country: data.country,
        loc: data.loc
      };
      return { geo: geoData };
    } else {
      return { geo: null, error: 'Failed to get location data' };
    }
  } catch (error) {
    return { geo: null, error: 'Network error when fetching location' };
  }
};

const getDeviceInfo = async (): Promise<any> => {
  try {
    return {
      platform: Platform.OS,
      osVersion: Device.osVersion || Platform.Version.toString(),
      deviceType: Device.deviceType || 'Unknown',
      deviceBrand: Device.brand || 'Unknown',
    };
  } catch (error) {
    return { error: 'Failed to get device information' };
  }
};

const storeUserSecurityInfo = async (
  uid: string, 
  ipData: {ip: string | null, error?: string}, 
  geoData: {geo: any | null, error?: string}, 
  deviceInfo: any
): Promise<void> => {
  if (!firestore) {
    return;
  }
  
  try {
    const securityRecord = {
      ipAddress: ipData.ip,
      ipError: ipData.error || null,
      geolocation: geoData.geo,
      geoError: geoData.error || null,
      deviceInfo: deviceInfo,
      timestamp: serverTimestamp(),
      sessionId: Math.random().toString(36).substring(2, 15),
    };
    
    const userDocRef = doc(firestore, 'users', uid);
    
    await setDoc(userDocRef, {
      uid: uid,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    const securityCollectionRef = collection(userDocRef, 'security_info');
    const securityDocRef = doc(securityCollectionRef);
    
    await setDoc(securityDocRef, securityRecord);
  } catch (error) {
    console.error('Error storing user security info:', error);
  }
};

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

const storeAuthState = async (user: User | null): Promise<boolean> => {
  try {
    if (!user) {
      await AsyncStorage.removeItem(USER_AUTH_KEY);
      return true;
    }

    const userData: UserData = {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      lastLoginAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(USER_AUTH_KEY, JSON.stringify(userData));
    return true;
  } catch (error) {
    console.error('Authentication storage failed:', error);
    return false;
  }
};

const checkRateLimiting = async (): Promise<boolean> => {
  try {
    const attemptsData = await AsyncStorage.getItem(AUTH_ATTEMPTS_KEY);
    
    if (!attemptsData) {
      return true;
    }
    
    const { attempts, timestamp } = JSON.parse(attemptsData);
    const now = Date.now();
    
    if (now - timestamp > AUTH_LOCKOUT_DURATION) {
      await AsyncStorage.removeItem(AUTH_ATTEMPTS_KEY);
      return true;
    }
    
    if (attempts >= MAX_AUTH_ATTEMPTS) {
      return false;
    }
    
    return true;
  } catch (error) {
    return true;
  }
};

const incrementAuthAttempts = async (): Promise<void> => {
  try {
    const attemptsData = await AsyncStorage.getItem(AUTH_ATTEMPTS_KEY);
    
    const now = Date.now();
    
    if (!attemptsData) {
      const newData = JSON.stringify({ attempts: 1, timestamp: now });
      await AsyncStorage.setItem(AUTH_ATTEMPTS_KEY, newData);
      return;
    }
    
    const { attempts, timestamp } = JSON.parse(attemptsData);
    
    if (now - timestamp > AUTH_LOCKOUT_DURATION) {
      const newData = JSON.stringify({ attempts: 1, timestamp: now });
      await AsyncStorage.setItem(AUTH_ATTEMPTS_KEY, newData);
      return;
    }
    
    const newData = JSON.stringify({ attempts: attempts + 1, timestamp });
    await AsyncStorage.setItem(AUTH_ATTEMPTS_KEY, newData);
  } catch (error) {
    // do nothing
  }
};

const resetAuthAttempts = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(AUTH_ATTEMPTS_KEY);
  } catch (error) {
    // do nothing
  }
};

const validateEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return email.length <= 320 && emailRegex.test(email);
};

const TRUSTED_EMAIL_PROVIDERS = [
  'gmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'zohomail.com',
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'gmx.com',
  'gmx.us',
  'gmx.co.uk',
  'aol.com'
];

export const isEmailFromTrustedProvider = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  
  const domain = email.split('@')[1]?.toLowerCase();
  return TRUSTED_EMAIL_PROVIDERS.includes(domain);
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

const createUserProfile = async (user: User, name: string): Promise<void> => {
  if (!firestore) {
    return;
  }
  
  try {
    const ipData = await getIpAddress();
    let geoData = { geo: null };
    if (ipData.ip) {
      geoData = await getGeoLocationFromIp(ipData.ip);
    }
    const deviceInfo = await getDeviceInfo();
    
    const isTrustedEmail = isEmailFromTrustedProvider(user.email || '');
    
    const userProfile = {
      uid: user.uid,
      email: user.email,
      displayName: name,
      emailVerified: user.emailVerified,
      photoURL: user.photoURL,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      trustedEmail: isTrustedEmail,
      registrationInfo: {
        platform: Platform.OS,
        ipAddress: ipData.ip,
        geolocation: geoData.geo,
        deviceInfo: deviceInfo,
        timestamp: serverTimestamp(),
      },
      settings: {
        emailNotifications: true,
        pushNotifications: true,
      },
      status: {
        isActive: true,
        lastActive: serverTimestamp(),
      }
    };
    
    await setDoc(doc(firestore, 'users', user.uid), userProfile, { merge: true });
    
    await storeUserSecurityInfo(
      user.uid, 
      ipData, 
      geoData, 
      deviceInfo
    );
  } catch (error) {
    // do nothing
  }
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
    await storeAuthState(user);
    await resetAuthAttempts();
    
    try {
      await sendEmailVerification(user);
      
      await createUserProfile(user, name);
      
      Promise.all([
        getIpAddress(),
        getDeviceInfo()
      ]).then(async ([ipData, deviceInfo]) => {
        let geoData = { geo: null };
        if (ipData.ip) {
          geoData = await getGeoLocationFromIp(ipData.ip);
        }
        
        await storeUserSecurityInfo(user.uid, ipData, geoData, deviceInfo);
      }).catch(error => {
        console.error('Error collecting security info:', error);
      });
    } catch (secondaryError) {
      console.error('Error during secondary registration operations:', secondaryError);
    }
    
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
    
    try {
      if (firestore) {
        const ipData = await getIpAddress();
        let geoData = { geo: null };
        if (ipData.ip) {
          geoData = await getGeoLocationFromIp(ipData.ip);
        }
        const deviceInfo = await getDeviceInfo();
        
        await setDoc(doc(firestore, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          'status.isActive': true,
          'status.lastActive': serverTimestamp(),
          lastLoginInfo: {
            platform: Platform.OS,
            ipAddress: ipData.ip,
            geolocation: geoData.geo,
            deviceInfo: deviceInfo,
            timestamp: serverTimestamp(),
          }
        }, { merge: true });
        
        await storeUserSecurityInfo(user.uid, ipData, geoData, deviceInfo);
      }
    } catch (firestoreError) {
      console.error('Error updating user data:', firestoreError);
    }
    
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
      error: 'Authentication failed. Please try again.' 
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
    const unsubscribe = onAuthStateChanged(auth!, (user: User | null) => {
      unsubscribe();
      resolve(!!user);
    });
  });
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
    
    return parsed;
  } catch (error) {
    await AsyncStorage.removeItem(USER_AUTH_KEY);
    return null;
  }
};

export const initAuthState = async (): Promise<User | null> => {
  try {
    if (!auth) return null;
    
    const currentUser = auth.currentUser;
    if (currentUser) return currentUser;
    
    const storedUser = await getUserFromSecureStorage();
    if (!storedUser) return null;
    
    return await new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth!, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  } catch (error) {
    console.error('Error initializing auth state:', error);
    return null;
  }
}; 