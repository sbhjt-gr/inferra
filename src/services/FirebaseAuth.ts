import { FirebaseAuthTypes } from '@react-native-firebase/auth';

// Import from split files
export { 
  initializeFirebase, 
  isFirebaseReady, 
  waitForAuthReady,
  debugGoogleOAuthConfig 
} from './FirebaseConfig';

export { 
  testFirebaseConnection, 
  getFirebaseServices,
  getAuthInstance,
  getFirestoreInstance 
} from './FirebaseInstances';

export { 
  registerWithEmail, 
  loginWithEmail 
} from './EmailAuth';

export { 
  signInWithGoogle,
  signInWithGoogleLogin 
} from './GoogleAuth';

export { 
  logoutUser,
  getCurrentUser,
  isAuthenticated,
  initializeAuthAndSync,
  initAuthState,
  refreshUserProfile,
  getCompleteUserData 
} from './AuthState';

// Export types
export type { UserData } from './AuthStorage'; 