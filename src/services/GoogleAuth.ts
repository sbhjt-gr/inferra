import { Platform } from 'react-native';
import { 
  signInWithCredential, 
  GoogleAuthProvider
} from '@react-native-firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp 
} from '@react-native-firebase/firestore';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';
import { getAuthInstance, getFirestoreInstance } from './FirebaseInstances';
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
import { getUserProfile } from './UserProfile';
import { storeAuthState } from './AuthStorage';

const configureGoogleSignIn = async (): Promise<void> => {
  const extra = Constants.expoConfig?.extra;
  
  if (!extra?.GOOGLE_SIGN_IN_WEB_CLIENT_ID) {
    throw new Error('Google Sign-In Web Client ID not configured');
  }
  
  if (__DEV__) {
    console.log('Configuring Google Sign-In with Web Client ID...');
    console.log('Web Client ID (first 20 chars):', extra.GOOGLE_SIGN_IN_WEB_CLIENT_ID.substring(0, 20) + '...');
  }
  
  try {
    const googleSignInConfig: any = {
      webClientId: extra.GOOGLE_SIGN_IN_WEB_CLIENT_ID,
    };

    // Add iOS client ID to avoid GoogleService-Info.plist requirement
    if (Platform.OS === 'ios') {
      if (extra.FIREBASE_IOS_CLIENT_ID) {
        googleSignInConfig.iosClientId = extra.FIREBASE_IOS_CLIENT_ID;
        if (__DEV__) {
          console.log('Adding iOS Client ID to avoid GoogleService-Info.plist requirement');
          console.log('iOS Client ID (first 20 chars):', extra.FIREBASE_IOS_CLIENT_ID.substring(0, 20) + '...');
        }
      } else if (extra.GOOGLE_SIGN_IN_WEB_CLIENT_ID) {
        // Fallback: use web client ID for iOS if specific iOS client ID is not available
        googleSignInConfig.iosClientId = extra.GOOGLE_SIGN_IN_WEB_CLIENT_ID;
        if (__DEV__) {
          console.log('Using Web Client ID as fallback for iOS Client ID in GoogleAuth');
          console.log('Web Client ID (first 20 chars):', extra.GOOGLE_SIGN_IN_WEB_CLIENT_ID.substring(0, 20) + '...');
        }
      } else {
        if (__DEV__) {
          console.warn('No iOS Client ID or Web Client ID found in GoogleAuth - may need GoogleService-Info.plist');
          console.log('Available Firebase iOS keys:', Object.keys(extra).filter(key => key.includes('IOS')));
        }
      }
    }

    await GoogleSignin.configure(googleSignInConfig);
    
    if (__DEV__) {
      console.log('Google Sign-In configured successfully');
      console.log('Configuration keys:', Object.keys(googleSignInConfig));
    }
  } catch (error) {
    if (__DEV__) {
      console.error('Google Sign-In configuration failed:', error);
    }
    throw error;
  }
};

const ensureGoogleSignInConfigured = async (): Promise<void> => {
  await configureGoogleSignIn();
  
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
    if (__DEV__) {
      console.log('Google Sign-In configuration verified');
    }
  } catch (error) {
    if (__DEV__) {
      console.error('Google Sign-In verification failed:', error);
    }
    throw error;
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

    await ensureGoogleSignInConfigured();

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    
    const response = await GoogleSignin.signIn();
    
    if (!response.data?.idToken) {
      await incrementAuthAttempts();
      return { success: false, error: 'Failed to get authentication' };
    }

    const googleCredential = GoogleAuthProvider.credential(response.data.idToken);
    const userCredential = await signInWithCredential(getAuthInstance(), googleCredential);
    const user = userCredential.user;

    await resetAuthAttempts();

    try {
      const ipData = await getIpAddress();
      let geoData = { geo: null };
      if (ipData.ip) {
        geoData = await getGeoLocationFromIp(ipData.ip);
      }
      const deviceInfo = await getDeviceInfo();

      const userDocRef = doc(getFirestoreInstance(), 'users', user.uid);
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
    } catch (firestoreError) {
      await storeAuthState(user);
    }

    return { success: true };

  } catch (error: any) {
    if (__DEV__) {
      console.error('Google Sign-In Error:', error);
    }
    
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
      error: 'Google sign-in failed. Please try again.' 
    };
  }
};

export const signInWithGoogleLogin = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const notRateLimited = await checkRateLimiting();
    if (!notRateLimited) {
      return { 
        success: false, 
        error: 'Too many attempts. Please try again later.' 
      };
    }

    await ensureGoogleSignInConfigured();

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    
    const response = await GoogleSignin.signIn();
    
    if (!response.data?.idToken || !response.data?.user?.email) {
      await incrementAuthAttempts();
      return { success: false, error: 'Failed to get authentication' };
    }

    const googleCredential = GoogleAuthProvider.credential(response.data.idToken);
    const userCredential = await signInWithCredential(getAuthInstance(), googleCredential);
    const user = userCredential.user;

    const userDocRef = doc(getFirestoreInstance(), 'users', user.uid);
    const existingDoc = await getDoc(userDocRef);

    if (!existingDoc.exists()) {
      try {
        await user.delete();
      } catch (deleteError) {
        await getAuthInstance().signOut();
      }
      
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
      
      await incrementAuthAttempts();
      return { 
        success: false, 
        error: 'No account found with this email. Please sign up first.' 
      };
    }

    await resetAuthAttempts();

    try {
      const ipData = await getIpAddress();
      let geoData = { geo: null };
      if (ipData.ip) {
        geoData = await getGeoLocationFromIp(ipData.ip);
      }
      const deviceInfo = await getDeviceInfo();

      const userDocRef = doc(getFirestoreInstance(), 'users', user.uid);
      const userProfile: any = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        photoURL: user.photoURL,
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        lastLoginInfo: {
          platform: Platform.OS,
          ipAddress: ipData.ip,
          geolocation: geoData.geo,
          deviceInfo: deviceInfo,
          timestamp: serverTimestamp(),
          provider: 'google'
        },
        status: {
          isActive: true,
          lastActive: serverTimestamp(),
        }
      };

      await setDoc(userDocRef, userProfile, { merge: true });
      await storeUserSecurityInfo(user.uid, ipData, geoData, deviceInfo);

      const profileData = await getUserProfile(user.uid);
      await storeAuthState(user, profileData);
    } catch (firestoreError) {
      await storeAuthState(user);
    }

    return { success: true };

  } catch (error: any) {
    if (__DEV__) {
      console.error('Google Sign-In Login Error:', error);
    }
    
    await incrementAuthAttempts();
    
    if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      return { success: false, error: 'Sign-in was cancelled' };
    } else if (error.code === statusCodes.IN_PROGRESS) {
      return { success: false, error: 'Sign-in is already in progress' };
    } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { success: false, error: 'Play Services not available or outdated' };
    } else if (error.code === 'auth/user-not-found') {
      return { 
        success: false, 
        error: 'No account found with this email. Please sign up first.' 
      };
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
      error: 'Google sign-in failed. Please try again.' 
    };
  }
}; 