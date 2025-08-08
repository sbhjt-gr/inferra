import { FirebaseAuthTypes } from '@react-native-firebase/auth';

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
  getCompleteUserData,
  forceRefreshUserData 
} from './AuthState';

export type { UserData } from './AuthStorage'; 