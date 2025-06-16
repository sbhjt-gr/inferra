import { Platform } from 'react-native';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { 
  UserData, 
  storeAuthState, 
  getUserFromSecureStorage 
} from './AuthStorage';
import { 
  validateEmail, 
  validatePassword, 
  validateName, 
  checkRateLimiting, 
  incrementAuthAttempts, 
  resetAuthAttempts,
  isEmailFromTrustedProvider,
  getIpAddress,
  getGeoLocationFromIp,
  getDeviceInfo,
  storeUserSecurityInfo
} from './SecurityUtils';
import { 
  createUserProfile, 
  getUserProfile, 
  updateEmailVerificationStatus,
  updateUserLoginInfo
} from './UserProfile';

let isFirebaseInitialized = false;

const initializeFirebase = async (): Promise<void> => {
  if (isFirebaseInitialized) {
    return;
  }

  try {
    const webClientId = Constants.expoConfig?.extra?.googleWebClientId;
    
    if (webClientId) {
      GoogleSignin.configure({
        webClientId,
        offlineAccess: true,
        hostedDomain: '',
        forceCodeForRefreshToken: true,
      });
    }
    
    isFirebaseInitialized = true;
  } catch (error) {
    console.error('Error initializing Firebase services. Please try again later.');
    throw error;
  }
};

initializeFirebase().catch(console.error);

export const isFirebaseReady = (): boolean => isFirebaseInitialized;

export const testFirebaseConnection = async (): Promise<{ connected: boolean; error?: string }> => {
  try {
    if (!isFirebaseInitialized) {
      return { connected: false, error: 'Firebase not initialized' };
    }
    
    const currentUser = auth().currentUser;
    if (currentUser) {
      await currentUser.reload();
    }
    
      return { connected: true };
  } catch (error: any) {
    console.error('Firebase test error:', error);
    return { connected: false, error: error.message || 'Unknown error' };
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
    
    const userCredential = await auth().createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    await user.updateProfile({ displayName: name });
    await resetAuthAttempts();
    
    try {
      await user.sendEmailVerification();
      
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
    
    const userCredential = await auth().signInWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    await resetAuthAttempts();
    
    try {
        await updateUserLoginInfo(user.uid);
        
        const profileData = await getUserProfile(user.uid);
        await storeAuthState(user, profileData);
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

export const signInWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const notRateLimited = await checkRateLimiting();
    if (!notRateLimited) {
      return { 
        success: false, 
        error: 'Too many attempts. Please try again later.' 
      };
    }

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    
    const response = await GoogleSignin.signIn();
    
    if (!response.data?.idToken) {
      await incrementAuthAttempts();
      return { success: false, error: 'Failed to get authentication token' };
    }

    const googleCredential = auth.GoogleAuthProvider.credential(response.data.idToken);
    const userCredential = await auth().signInWithCredential(googleCredential);
    const user = userCredential.user;

    await resetAuthAttempts();

    try {
      const ipData = await getIpAddress();
      let geoData = { geo: null };
      if (ipData.ip) {
        geoData = await getGeoLocationFromIp(ipData.ip);
      }
      const deviceInfo = await getDeviceInfo();

      const userDocRef = firestore().collection('users').doc(user.uid);
      const existingDoc = await userDocRef.get();

      const isTrustedEmail = isEmailFromTrustedProvider(user.email || '');

      const userProfile: any = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        photoURL: user.photoURL,
        updatedAt: firestore.FieldValue.serverTimestamp(),
        lastLoginAt: firestore.FieldValue.serverTimestamp(),
        trustedEmail: isTrustedEmail,
        lastLoginInfo: {
          platform: Platform.OS,
          ipAddress: ipData.ip,
          geolocation: geoData.geo,
          deviceInfo: deviceInfo,
          timestamp: firestore.FieldValue.serverTimestamp(),
          provider: 'google'
        },
        settings: {
          emailNotifications: true,
          pushNotifications: true,
        },
        status: {
          isActive: true,
          lastActive: firestore.FieldValue.serverTimestamp(),
        }
      };

      if (!existingDoc.exists()) {
        userProfile.createdAt = firestore.FieldValue.serverTimestamp();
        userProfile.registrationInfo = {
          platform: Platform.OS,
          ipAddress: ipData.ip,
          geolocation: geoData.geo,
          deviceInfo: deviceInfo,
          timestamp: firestore.FieldValue.serverTimestamp(),
          provider: 'google'
        };
      }

      await userDocRef.set(userProfile, { merge: true });
      await storeUserSecurityInfo(user.uid, ipData, geoData, deviceInfo);

      const profileData = await getUserProfile(user.uid);
      await storeAuthState(user, profileData);
    } catch (firestoreError) {
      await storeAuthState(user);
    }

    return { success: true };

  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    
    await incrementAuthAttempts();
    
    if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      return { success: false, error: 'Sign-in was cancelled' };
    } else if (error.code === statusCodes.IN_PROGRESS) {
      return { success: false, error: 'Sign-in is already in progress' };
    } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { success: false, error: 'Play Services not available or outdated' };
    } else if (error.code === 'auth/account-exists-with-different-credential') {
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
    }
    
    return { 
      success: false, 
      error: `Google sign-in failed: ${error.message || 'Unknown error'}. Please try again.` 
    };
  }
};

export const logoutUser = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    await auth().signOut();
    
    try {
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
    } catch (googleError) {
      // Google sign-out is optional, continue even if it fails
    }
    
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

export const getCurrentUser = (): FirebaseAuthTypes.User | null => {
  return auth().currentUser;
};

export const isAuthenticated = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    const unsubscribe = auth().onAuthStateChanged((user: FirebaseAuthTypes.User | null) => {
      unsubscribe();
      resolve(!!user);
    });
  });
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
      // Continue even if reload fails
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
  } catch (error) {
    console.error('Error initializing auth and sync:', error);
    return { user: null, profile: null };
  }
};

export const initAuthState = async (): Promise<{ user: FirebaseAuthTypes.User | null; profile: UserData | null }> => {
  try {
    const currentUser = auth().currentUser;
    if (currentUser) {
      try {
        await currentUser.reload();
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
      const unsubscribe = auth().onAuthStateChanged(async (user) => {
        unsubscribe();
        if (user) {
          try {
            await user.reload();
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
    await currentUser.reload();
  } catch (error) {
    // Continue even if reload fails
  }
  
  const profileData = await getUserProfile(currentUser.uid);
  if (profileData) {
    await storeAuthState(currentUser, profileData);
  }
  
  return profileData;
};

export const getCompleteUserData = async (): Promise<{
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
  return new Promise((resolve) => {
    const maxAttempts = 50;
    let attempts = 0;
    
    const checkReady = () => {
      if (isFirebaseInitialized || attempts >= maxAttempts) {
        resolve(isFirebaseInitialized);
        return;
      }
      
      attempts++;
      setTimeout(checkReady, 100);
    };
    
    checkReady();
  });
};

export const getFirebaseServices = () => {
  return {
    auth: auth(),
    firestore: firestore(),
  };
};

export type { UserData } from './AuthStorage'; 