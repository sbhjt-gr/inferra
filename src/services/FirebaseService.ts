export {
  initializeFirebase,
  isFirebaseReady,
  waitForAuthReady,
  registerWithEmail,
  loginWithEmail,
  signInWithGoogle,
  logoutUser,
  getCurrentUser,
  isAuthenticated,
  getUserProfile,
  onAuthStateChange,
  type UserData
} from './FirebaseAuth';

export {
  getUserFromSecureStorage,
  storeAuthState
} from './AuthStorage';

export {
  validateEmail,
  validatePassword,
  validateName,
  checkRateLimiting,
  incrementAuthAttempts,
  resetAuthAttempts,
  getIpAddress,
  getGeoLocationFromIp,
  getDeviceInfo,
  storeUserSecurityInfo,
  isEmailFromTrustedProvider
} from './SecurityUtils';
