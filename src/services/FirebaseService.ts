export {
  initializeFirebase,
  isFirebaseReady,
  waitForAuthReady,
  registerWithEmail,
  loginWithEmail,
  signInWithGoogle,
  signInWithApple,
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
  validateReportContent,
  validateProvider,
  validateCategory,
  sanitizeInput,
  checkRateLimiting,
  incrementAuthAttempts,
  resetAuthAttempts,
  getIpAddress,
  getGeoLocationFromIp,
  getDeviceInfo,
  storeUserSecurityInfo,
  isEmailFromTrustedProvider
} from './SecurityUtils';
