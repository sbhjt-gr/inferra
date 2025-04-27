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
  browserLocalPersistence,
  setPersistence
} from 'firebase/auth';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

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
let firestore: any = undefined;

try {
  const firebaseConfig = getSecureConfig();
  
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  
  auth = getAuth(app);
  
  if (Platform.OS === 'web' && auth) {
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
      })
      .catch(error => {
      });
  }
  
  firestore = getFirestore(app);
} catch (error) {
  // do nothing
}

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
      ipError: ipData.error,
      geolocation: geoData.geo,
      geoError: geoData.error,
      deviceInfo: deviceInfo,
      timestamp: serverTimestamp(),
      sessionId: Math.random().toString(36).substring(2, 15),
    };
    
    const userDocRef = doc(firestore, 'users', uid);
    
    await setDoc(userDocRef, {
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    const securityCollectionRef = collection(userDocRef, 'security_info');
    const securityDocRef = doc(securityCollectionRef);
    
    await setDoc(securityDocRef, securityRecord);
  } catch (error) {
    // do nothing
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
    // do nothing
  }
};

const resetAuthAttempts = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(AUTH_ATTEMPTS_KEY);
  } catch (error) {
    // do nothing
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
    
    const userProfile = {
      uid: user.uid,
      email: user.email,
      displayName: name,
      emailVerified: user.emailVerified,
      photoURL: user.photoURL,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
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
        theme: 'auto',
        language: 'en',
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
    
    await sendEmailVerification(user);
    
    await createUserProfile(user, name);
    
    await storeAuthState(user);
    
    await resetAuthAttempts();
    
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
    });
    
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
    
    if (firestore) {
      const ipData = await getIpAddress();
      let geoData = { geo: null };
      if (ipData.ip) {
        geoData = await getGeoLocationFromIp(ipData.ip);
      }
      const deviceInfo = await getDeviceInfo();
      
      await setDoc(doc(firestore, 'users', user.uid), {
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
    
    await createUserProfile(user, user.displayName || 'Google User');
    
    if (firestore) {
      const ipData = await getIpAddress();
      let geoData = { geo: null };
      if (ipData.ip) {
        geoData = await getGeoLocationFromIp(ipData.ip);
      }
      const deviceInfo = await getDeviceInfo();
      
      await setDoc(doc(firestore, 'users', user.uid), {
        lastLoginAt: serverTimestamp(),
        'status.isActive': true,
        'status.lastActive': serverTimestamp(),
        lastLoginInfo: {
          provider: 'google',
          platform: Platform.OS,
          ipAddress: ipData.ip,
          geolocation: geoData.geo,
          deviceInfo: deviceInfo,
          timestamp: serverTimestamp(),
        }
      }, { merge: true });
    }
    
    await storeAuthState(user);
    
    return { success: true };
  } catch (error: any) {
    
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
    
    await createUserProfile(user, user.displayName || 'GitHub User');
    
    if (firestore) {
      const ipData = await getIpAddress();
      let geoData = { geo: null };
      if (ipData.ip) {
        geoData = await getGeoLocationFromIp(ipData.ip);
      }
      const deviceInfo = await getDeviceInfo();
      
      await setDoc(doc(firestore, 'users', user.uid), {
        lastLoginAt: serverTimestamp(),
        'status.isActive': true,
        'status.lastActive': serverTimestamp(),
        lastLoginInfo: {
          provider: 'github',
          platform: Platform.OS,
          ipAddress: ipData.ip,
          geolocation: geoData.geo,
          deviceInfo: deviceInfo,
          timestamp: serverTimestamp(),
        }
      }, { merge: true });
    }
    
    await storeAuthState(user);
    
    return { success: true };
  } catch (error: any) {
    
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
    await SecureStore.deleteItemAsync(USER_AUTH_KEY);
    return null;
  }
}; 