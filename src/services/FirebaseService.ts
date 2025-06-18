export {
  isFirebaseReady,
  testFirebaseConnection,
  registerWithEmail,
  loginWithEmail,
  signInWithGoogle,
  signInWithGoogleLogin,
  logoutUser,
  getCurrentUser,
  isAuthenticated,
  initializeAuthAndSync,
  initAuthState,
  refreshUserProfile,
  getCompleteUserData,
  waitForAuthReady,
  getFirebaseServices,
  debugGoogleOAuthConfig,
  type UserData
} from './FirebaseAuth';

export {
  getUserFromSecureStorage,
  storeAuthState
} from './AuthStorage';

export {
  getUserProfile,
  updateEmailVerificationStatus,
  createUserProfile,
  updateUserLoginInfo
} from './UserProfile';

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