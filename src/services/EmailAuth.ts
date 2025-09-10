import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile, 
  sendEmailVerification 
} from '@react-native-firebase/auth';
import { getAuthInstance } from './FirebaseInstances';
import { 
  validateEmail, 
  validatePassword, 
  validateName, 
  checkRateLimiting, 
  incrementAuthAttempts, 
  resetAuthAttempts
} from './SecurityUtils';
import { 
  createUserProfile, 
  getUserProfile, 
  updateUserLoginInfo
} from './UserProfile';
import { storeAuthState } from './AuthStorage';

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
    
    const userCredential = await createUserWithEmailAndPassword(getAuthInstance(), email, password);
    const user = userCredential.user;
    
    await updateProfile(user, { displayName: name });
    await resetAuthAttempts();
    
    try {
      await sendEmailVerification(user);
      
      await createUserProfile(user, name);
      
      const profileData = await getUserProfile(user.uid);
      await storeAuthState(user, profileData);
    } catch (secondaryError) {
      if (__DEV__) {
      }
    }
    
    return { 
      success: true,
      passwordWarning: passwordValidation.isWeak ? passwordValidation.message : undefined
    };
  } catch (error: any) {
    if (__DEV__) {
    }
    
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
      return { success: false, error: 'Service temporarily unavailable. Please contact support.' };
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
    
    const userCredential = await signInWithEmailAndPassword(getAuthInstance(), email, password);
    const user = userCredential.user;
    
    await resetAuthAttempts();
    
    try {
        await updateUserLoginInfo(user.uid);
        
        const profileData = await getUserProfile(user.uid);
        await storeAuthState(user, profileData);
    } catch {
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
