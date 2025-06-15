import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendEmailVerification,
  signOut,
  updateProfile,
  User,
  onAuthStateChanged,
  getAuth,
  Auth,
  reload,
  GoogleAuthProvider,
  signInWithCredential
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  serverTimestamp 
} from 'firebase/firestore';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';

WebBrowser.maybeCompleteAuthSession();

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
      console.error('Available config:', Constants.expoConfig?.extra);
      throw new Error(
        `Firebase configuration is incomplete. Missing: ${missingConfigs.join(', ')}. Check your environment variables.`
      );
    }

    return config as Record<string, string>;
  } catch (error) {
    console.error('Firebase configuration error:', error);
    console.error('Available config:', Constants.expoConfig?.extra);
    throw new Error('Firebase initialization failed. Please check your environment configuration.');
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
    
    auth = getAuth(app);
    
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

export const testFirebaseConnection = async (): Promise<{ connected: boolean; error?: string }> => {
  try {
    if (!isFirebaseInitialized) {
      return { connected: false, error: 'Firebase not initialized' };
    }
    
    if (!auth) {
      return { connected: false, error: 'Firebase Auth not available' };
    }
    
    
    try {
      await auth.authStateReady();
      return { connected: true };
    } catch (error) {
      console.error('Firebase connection test failed:', error);
      return { connected: false, error: 'Firebase connection failed' };
    }
  } catch (error: any) {
    console.error('Firebase test error:', error);
    return { connected: false, error: error.message || 'Unknown error' };
  }
};

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
      lastLoginAt: serverTimestamp(),
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
  createdAt?: any;
  updatedAt?: any;
  trustedEmail?: boolean;
  settings?: any;
  status?: any;
  registrationInfo?: any;
  lastLoginInfo?: any;
};

const USER_AUTH_KEY = 'inferra_secure_user_auth_state';
const AUTH_ATTEMPTS_KEY = 'inferra_secure_auth_attempts';
const MAX_AUTH_ATTEMPTS = 5;
const AUTH_LOCKOUT_DURATION = 15 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 8;

const storeAuthState = async (user: User | null, profileData?: any): Promise<boolean> => {
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

const validatePassword = (password: string, strict: boolean = false): { valid: boolean; message?: string; isWeak?: boolean } => {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }
  
  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters' };
  }
  
  if (!strict) {
    return { valid: true };
  }
  
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: true, isWeak: true, message: `Your password is weak. Consider using at least ${PASSWORD_MIN_LENGTH} characters` };
  }
  
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  if (!(hasUpperCase && hasLowerCase && (hasNumbers || hasSpecialChars))) {
    return { 
      valid: true, 
      isWeak: true,
      message: 'Your password is weak. Consider including uppercase, lowercase, and numbers or special characters' 
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
    
    const userDocRef = doc(firestore, 'users', user.uid);
    const existingDoc = await getDoc(userDocRef);
    
    const userProfile: any = {
      uid: user.uid,
      email: user.email,
      displayName: name,
      emailVerified: user.emailVerified,
      photoURL: user.photoURL,
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
    
    if (!existingDoc.exists()) {
      userProfile.createdAt = serverTimestamp();
    }
    
    await setDoc(userDocRef, userProfile, { merge: true });
    
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
): Promise<{ success: boolean; error?: string; passwordWarning?: string }> => {
  try {
    
    if (!validateName(name)) {
      return { success: false, error: 'Invalid name format' };
    }
    
    if (!validateEmail(email)) {
      return { success: false, error: 'Invalid email format' };
    }
    
    const passwordValidation = validatePassword(password, false);
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
      console.error('Firebase auth not initialized');
      
      try {
        const services = getFirebaseServices();
        if (!services.auth) {
          return { success: false, error: 'Firebase authentication service is not available. Please check your configuration.' };
        }
      } catch (initError) {
        console.error('Failed to initialize Firebase:', initError);
        return { success: false, error: 'Firebase initialization failed. Please check your network connection and try again.' };
      }
    }

    const userCredential = await createUserWithEmailAndPassword(auth!, email, password);
    const user = userCredential.user;
    
    await updateProfile(user, { displayName: name });
    await resetAuthAttempts();
    
    try {
      await sendEmailVerification(user);
      
      await createUserProfile(user, name);
      
      const profileData = await getUserProfile(user.uid);
      await storeAuthState(user, profileData);
    } catch (secondaryError) {
      console.error('Error during secondary registration operations:', secondaryError);
    }
    
    return { 
      success: true,
      passwordWarning: passwordValidation.isWeak ? passwordValidation.message : undefined
    };
  } catch (error: any) {
    console.error('Registration error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    await incrementAuthAttempts();
    
    if (error.code === 'auth/email-already-in-use') {
      return { success: false, error: 'Email address is already in use' };
    } else if (error.code === 'auth/invalid-email') {
      return { success: false, error: 'Invalid email format' };
    } else if (error.code === 'auth/weak-password') {
      return { success: false, error: 'Password is too weak' };
    } else if (error.code === 'auth/network-request-failed') {
      return { success: false, error: 'Network error. Please check your internet connection and try again.' };
    } else if (error.code === 'auth/internal-error') {
      return { success: false, error: 'Configuration error. Please contact support.' };
    } else if (error.message?.includes('Firebase configuration')) {
      return { success: false, error: 'Service configuration error. Please contact support.' };
    }
    
    return { 
      success: false, 
      error: `Registration failed: ${error.message || 'Unknown error'}. Please try again.` 
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
        
        const profileData = await getUserProfile(user.uid);
        await storeAuthState(user, profileData);
      } else {
        await storeAuthState(user);
      }
    } catch (firestoreError) {
      console.error('Error updating user data:', firestoreError);
      await storeAuthState(user);
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
    
    try {
      await AsyncStorage.setItem('@remote_models_enabled', 'false');
    } catch (error) {
      console.error('Error disabling remote models on logout:', error);
    }
    
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
    
    await waitForAuthReady();
    
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.uid === parsed.uid) {
      try {
        await reload(currentUser);
      } catch (error) {
        // Continue even if reload fails
      }
      
      if (parsed.emailVerified !== currentUser.emailVerified) {
        parsed.emailVerified = currentUser.emailVerified;
        
        if (firestore) {
          await updateEmailVerificationStatus(currentUser.uid, currentUser.emailVerified);
        }
        
        await AsyncStorage.setItem(USER_AUTH_KEY, JSON.stringify(parsed));
      }
    }
    
    return parsed;
  } catch (error) {
    await AsyncStorage.removeItem(USER_AUTH_KEY);
    return null;
  }
};

export const getUserProfile = async (uid: string): Promise<UserData | null> => {
  if (!firestore) {
    console.error('Firestore not initialized');
    return null;
  }

  try {
    const userDocRef = doc(firestore, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      const currentUser = getCurrentUser();
      
      return {
        uid: data.uid,
        email: data.email,
        emailVerified: (currentUser && currentUser.uid === uid) ? currentUser.emailVerified : (data.emailVerified || false),
        displayName: data.displayName,
        lastLoginAt: data.lastLoginAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        trustedEmail: data.trustedEmail,
        settings: data.settings,
        status: data.status,
        registrationInfo: data.registrationInfo,
        lastLoginInfo: data.lastLoginInfo
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
};

export const initializeAuthAndSync = async (): Promise<{ user: User | null; profile: UserData | null }> => {
  try {
    await waitForAuthReady();
    
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return { user: null, profile: null };
    }
    
    try {
      await reload(currentUser);
    } catch (error) {
      // Continue even if reload fails
    }
    
    if (firestore) {
      await updateEmailVerificationStatus(currentUser.uid, currentUser.emailVerified);
    }
    
    const profileData = await getUserProfile(currentUser.uid);
    if (profileData) {
      profileData.emailVerified = currentUser.emailVerified;
      await storeAuthState(currentUser, profileData);
    } else {
      await storeAuthState(currentUser);
    }
    
    return { user: currentUser, profile: profileData };
  } catch (error) {
    console.error('Error initializing auth and sync:', error);
    return { user: null, profile: null };
  }
};

export const initAuthState = async (): Promise<{ user: User | null; profile: UserData | null }> => {
  try {
    if (!auth) return { user: null, profile: null };
    
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        await reload(currentUser);
      } catch (error) {
        // Continue even if reload fails
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
      const unsubscribe = onAuthStateChanged(auth!, async (user) => {
        unsubscribe();
        if (user) {
          try {
            await reload(user);
          } catch (error) {
            // Continue even if reload fails
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
    console.error('Error initializing auth state:', error);
    return { user: null, profile: null };
  }
};

export const refreshUserProfile = async (): Promise<UserData | null> => {
  const currentUser = getCurrentUser();
  if (!currentUser) return null;
  
  try {
    await reload(currentUser);
  } catch (error) {
    // Continue even if reload fails
  }
  
  const profileData = await getUserProfile(currentUser.uid);
  if (profileData) {
    await storeAuthState(currentUser, profileData);
  }
  
  return profileData;
};

export const updateEmailVerificationStatus = async (uid: string, emailVerified: boolean): Promise<void> => {
  if (!firestore) {
    return;
  }
  
  try {
    const userDocRef = doc(firestore, 'users', uid);
    await setDoc(userDocRef, {
      emailVerified: emailVerified,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Error updating email verification status:', error);
  }
};

export const getCompleteUserData = async (): Promise<{
  user: User | null;
  profile: UserData | null;
  isAuthenticated: boolean;
}> => {
  try {
    await waitForAuthReady();
    
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
      await reload(currentUser);
    } catch (error) {
      // Continue even if reload fails
    }

    let profileData = await getUserFromSecureStorage();
    
    if (!profileData || profileData.uid !== currentUser.uid) {
      profileData = await getUserProfile(currentUser.uid);
      if (profileData) {
        await storeAuthState(currentUser, profileData);
      }
    }
    
    if (profileData && profileData.emailVerified !== currentUser.emailVerified) {
      await updateEmailVerificationStatus(currentUser.uid, currentUser.emailVerified);
      profileData.emailVerified = currentUser.emailVerified;
      await storeAuthState(currentUser, profileData);
    }

    return {
      user: currentUser,
      profile: profileData,
      isAuthenticated: true
    };
  } catch (error) {
    console.error('Error getting complete user data:', error);
    return {
      user: null,
      profile: null,
      isAuthenticated: false
    };
  }
};

export const waitForAuthReady = async (): Promise<boolean> => {
  try {
    if (!auth) return false;
    
    await auth.authStateReady();
    return true;
  } catch (error) {
    return false;
  }
};

const GOOGLE_OAUTH_CONFIG = {
  iosClientId: Constants.expoConfig?.extra?.googleOAuthIosClientId,
  androidClientId: Constants.expoConfig?.extra?.googleOAuthAndroidClientId,
  scopes: ['openid', 'profile', 'email'],
  additionalParameters: {},
  customParameters: {
    prompt: 'select_account',
  },
};

const getGoogleOAuthConfig = () => {
  console.log('Building OAuth config for platform:', Platform.OS);
  console.log('Available OAuth config:', {
    iosClientId: GOOGLE_OAUTH_CONFIG.iosClientId ? `${GOOGLE_OAUTH_CONFIG.iosClientId.substring(0, 20)}...` : 'NOT SET',
    androidClientId: GOOGLE_OAUTH_CONFIG.androidClientId ? `${GOOGLE_OAUTH_CONFIG.androidClientId.substring(0, 20)}...` : 'NOT SET'
  });
  
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'com.gorai.ragionare',
    path: 'auth',
  });
  console.log('Generated redirect URI:', redirectUri);

  const clientId = Platform.OS === 'ios' 
    ? GOOGLE_OAUTH_CONFIG.iosClientId 
    : GOOGLE_OAUTH_CONFIG.androidClientId;

  if (!clientId) {
    console.error(`Missing ${Platform.OS} client ID in environment variables`);
    throw new Error(`Google OAuth ${Platform.OS} client ID not configured. Please check your environment variables.`);
  }

  console.log('Using client ID for', Platform.OS, ':', `${clientId.substring(0, 20)}...`);

  return {
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes: GOOGLE_OAUTH_CONFIG.scopes,
    additionalParameters: GOOGLE_OAUTH_CONFIG.additionalParameters,
    customParameters: GOOGLE_OAUTH_CONFIG.customParameters,
  };
};

const validateGoogleIdToken = (idToken: string): boolean => {
  try {
    if (!idToken || typeof idToken !== 'string') return false;
    
    const parts = idToken.split('.');
    if (parts.length !== 3) return false;
    
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    
    if (!payload.iss || !payload.aud || !payload.exp || !payload.iat) return false;
    
    if (payload.exp * 1000 < Date.now()) return false;
    
    const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
    if (!validIssuers.includes(payload.iss)) return false;
    
    if (!payload.email || !payload.email_verified) return false;
    
    return true;
  } catch (error) {
    return false;
  }
};

export const signInWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    console.log('Starting Google Sign-In process...');
    
    const notRateLimited = await checkRateLimiting();
    if (!notRateLimited) {
      console.error('Rate limited');
      return { 
        success: false, 
        error: 'Too many attempts. Please try again later.' 
      };
    }

    console.log('Rate limiting check passed');

    if (!auth) {
      console.log('Auth not initialized, attempting to get services...');
      const services = getFirebaseServices();
      if (!services.auth) {
        console.error('Firebase auth service not available');
        return { success: false, error: 'Firebase authentication service is not available.' };
      }
    }

    console.log('Firebase auth service available');
    console.log('Getting Google OAuth config...');
    
    const config = getGoogleOAuthConfig();
    console.log('OAuth config obtained:', {
      clientId: config.clientId ? `${config.clientId.substring(0, 20)}...` : 'NOT SET',
      platform: Platform.OS,
      redirectUri: config.redirectUri
    });
    
    console.log('Generating PKCE code challenge...');
    const codeVerifier = await Crypto.getRandomBytesAsync(32).then(bytes => 
      Array.from(bytes).map(b => String.fromCharCode(b)).join('')
    );
    
    const codeChallenge = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      codeVerifier,
      { encoding: Crypto.CryptoEncoding.BASE64 }
    ).then(hash => hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''));
    
    console.log('PKCE code challenge generated');

    console.log('Creating auth request...');
    const request = new AuthSession.AuthRequest({
      ...config,
      codeChallenge,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
    });

    console.log('Prompting user for authentication...');
    const result = await request.promptAsync({
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    });
    
    console.log('Auth result received:', { 
      type: result.type, 
      hasParams: 'params' in result,
      hasCode: 'params' in result && !!result.params?.code 
    });

    if (result.type !== 'success' || !result.params.code) {
      if (result.type === 'cancel') {
        return { success: false, error: 'Sign-in was cancelled' };
      }
      
      await incrementAuthAttempts();
      return { success: false, error: 'Authentication failed. Please try again.' };
    }

    console.log('Exchanging authorization code for tokens...');
    const tokenResponse = await AuthSession.exchangeCodeAsync(
      {
        code: result.params.code,
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        extraParams: {
          code_verifier: codeVerifier,
        },
      },
      {
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
      }
    );
    
    console.log('Token exchange result:', {
      hasIdToken: !!tokenResponse.idToken,
      hasAccessToken: !!tokenResponse.accessToken
    });

    if (!tokenResponse.idToken) {
      await incrementAuthAttempts();
      return { success: false, error: 'Failed to get authentication token' };
    }

    if (!validateGoogleIdToken(tokenResponse.idToken)) {
      await incrementAuthAttempts();
      return { success: false, error: 'Invalid authentication token received' };
    }

    const credential = GoogleAuthProvider.credential(tokenResponse.idToken, tokenResponse.accessToken);
    const userCredential = await signInWithCredential(auth!, credential);
    const user = userCredential.user;

    await resetAuthAttempts();

    try {
      if (firestore) {
        const ipData = await getIpAddress();
        let geoData = { geo: null };
        if (ipData.ip) {
          geoData = await getGeoLocationFromIp(ipData.ip);
        }
        const deviceInfo = await getDeviceInfo();

        const userDocRef = doc(firestore, 'users', user.uid);
        const existingDoc = await getDoc(userDocRef);

        const isTrustedEmail = isEmailFromTrustedProvider(user.email || '');

        const userProfile: any = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          photoURL: user.photoURL,
          updatedAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          trustedEmail: isTrustedEmail,
          lastLoginInfo: {
            platform: Platform.OS,
            ipAddress: ipData.ip,
            geolocation: geoData.geo,
            deviceInfo: deviceInfo,
            timestamp: serverTimestamp(),
            provider: 'google'
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

        if (!existingDoc.exists()) {
          userProfile.createdAt = serverTimestamp();
          userProfile.registrationInfo = {
            platform: Platform.OS,
            ipAddress: ipData.ip,
            geolocation: geoData.geo,
            deviceInfo: deviceInfo,
            timestamp: serverTimestamp(),
            provider: 'google'
          };
        }

        await setDoc(userDocRef, userProfile, { merge: true });
        await storeUserSecurityInfo(user.uid, ipData, geoData, deviceInfo);

        const profileData = await getUserProfile(user.uid);
        await storeAuthState(user, profileData);
      } else {
        await storeAuthState(user);
      }
    } catch (firestoreError) {
      await storeAuthState(user);
    }

    return { success: true };

  } catch (error: any) {
    console.error('Google Sign-In Error:', {
      code: error.code,
      message: error.message,
      stack: error.stack?.split('\n')[0]
    });
    
    await incrementAuthAttempts();
    
    if (error.code === 'auth/account-exists-with-different-credential') {
      return { 
        success: false, 
        error: 'An account already exists with this email using a different sign-in method.' 
      };
    } else if (error.code === 'auth/invalid-credential') {
      return { 
        success: false, 
        error: 'Invalid credentials. Please try again.' 
      };
    } else if (error.code === 'auth/operation-not-allowed') {
      return { 
        success: false, 
        error: 'Google sign-in is not enabled. Please contact support.' 
      };
    } else if (error.code === 'auth/user-disabled') {
      return { 
        success: false, 
        error: 'This account has been disabled.' 
      };
    } else if (error.message?.includes('OAuth') || error.message?.includes('client ID')) {
      return { 
        success: false, 
        error: 'Google sign-in configuration error. Please contact support.' 
      };
    }
    
    return { 
      success: false, 
      error: `Google sign-in failed: ${error.message || 'Unknown error'}. Please try again.` 
    };
  }
};

export const debugGoogleOAuthConfig = () => {
  console.log('Google OAuth Configuration Debug:');
  console.log('Platform:', Platform.OS);
  console.log('Environment Variables:');
  console.log('  - iOS Client ID:', Constants.expoConfig?.extra?.googleOAuthIosClientId ? 'SET' : 'NOT SET');
  console.log('  - Android Client ID:', Constants.expoConfig?.extra?.googleOAuthAndroidClientId ? 'SET' : 'NOT SET');
  
  if (Constants.expoConfig?.extra?.googleOAuthIosClientId) {
    console.log('  - iOS Client ID Preview:', `${Constants.expoConfig.extra.googleOAuthIosClientId.substring(0, 30)}...`);
  }
  
  if (Constants.expoConfig?.extra?.googleOAuthAndroidClientId) {
    console.log('  - Android Client ID Preview:', `${Constants.expoConfig.extra.googleOAuthAndroidClientId.substring(0, 30)}...`);
  }
  
  try {
    const config = getGoogleOAuthConfig();
    console.log('OAuth config generation successful');
    console.log('  - Client ID:', `${config.clientId.substring(0, 30)}...`);
    console.log('  - Redirect URI:', config.redirectUri);
  } catch (error: any) {
    console.error('OAuth config generation failed:', error.message);
  }
  
  console.log('Firebase Auth Status:', auth ? 'Initialized' : 'Not Initialized');
  console.log('Firebase Ready:', isFirebaseReady());
}; 