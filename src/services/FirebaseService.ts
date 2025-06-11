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
  Auth
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

    console.log('Firebase configuration loaded successfully');
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
    
    console.log('Testing Firebase connection...');
    
    try {
      await auth.authStateReady();
      console.log('Firebase connection test passed');
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
    console.log('Starting registration process...');
    
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
      console.log('Attempting to initialize Firebase services...');
      
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

    console.log('Creating user account...');
    const userCredential = await createUserWithEmailAndPassword(auth!, email, password);
    const user = userCredential.user;
    console.log('User account created successfully');
    
    await updateProfile(user, { displayName: name });
    await resetAuthAttempts();
    
    try {
      console.log('Sending email verification...');
      await sendEmailVerification(user);
      
      console.log('Creating user profile...');
      await createUserProfile(user, name);
      
      const profileData = await getUserProfile(user.uid);
      await storeAuthState(user, profileData);
    } catch (secondaryError) {
      console.error('Error during secondary registration operations:', secondaryError);
    }
    
    console.log('Registration completed successfully');
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

export const initAuthState = async (): Promise<{ user: User | null; profile: UserData | null }> => {
  try {
    if (!auth) return { user: null, profile: null };
    
    const currentUser = auth.currentUser;
    if (currentUser) {
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
    const currentUser = getCurrentUser();
    
    if (!currentUser) {
      const storedProfile = await getUserFromSecureStorage();
      return {
        user: null,
        profile: storedProfile,
        isAuthenticated: false
      };
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

export const signInWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    return { 
      success: false, 
      error: 'Google Sign-In is not yet implemented. Please use email registration.' 
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: 'Google Sign-In failed. Please try again.' 
    };
  }
}; 