import { Platform } from 'react-native';
import { getApp, initializeApp } from '@react-native-firebase/app';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

let isInitialized = false;

export const initializeFirebase = async (): Promise<void> => {
  try {
    if (__DEV__) {
    }

    let app;
    try {
      app = getApp();
      isInitialized = true;
      if (__DEV__) {
      }
      return;
    } catch (error: any) {
      if (__DEV__) {
      }
      
      if (error.code === 'app/no-app' || error.message?.includes('No Firebase App')) {
        if (__DEV__) {
        }
        
        try {
          app = getApp('[DEFAULT]');
          isInitialized = true;
          
          if (__DEV__) {
          }
        } catch (secondError: any) {
          if (__DEV__) {
          }
          throw secondError;
        }
      } else {
        if (__DEV__) {
        }
        throw error;
      }
    }

    const extra = Constants.expoConfig?.extra;
    if (!extra?.GOOGLE_SIGN_IN_WEB_CLIENT_ID) {
      if (__DEV__) {
      }
    } else {
      try {
        if (__DEV__) {
        }
        
        await GoogleSignin.configure({
          webClientId: extra.GOOGLE_SIGN_IN_WEB_CLIENT_ID,
        });
        
        if (__DEV__) {
          
          try {
            const isConfigured = await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
          } catch (playServicesError) {
          }
        }
      } catch (googleError) {
        if (__DEV__) {
        }
      }
    }

    if (__DEV__) {
    }

  } catch (error) {
    if (__DEV__) {
    }
    isInitialized = false;
    
    if (__DEV__) {
      throw error;
    } else {
      throw new Error('Service initialization failed');
    }
  }
};

export const isFirebaseReady = (): boolean => {
  if (!isInitialized) {
    return false;
  }
  
  try {
    getApp();
    return true;
  } catch (error) {
    isInitialized = false;
    return false;
  }
};

export const waitForAuthReady = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    const maxAttempts = 50;
    let attempts = 0;
    
    const checkReady = () => {
      if (isInitialized || attempts >= maxAttempts) {
        resolve(isInitialized);
        return;
      }
      
      attempts++;
      setTimeout(checkReady, 100);
    };
    
    checkReady();
  });
};

export const debugGoogleOAuthConfig = () => {
  if (!__DEV__) {
    return {
      webClientId: 'Production mode',
      hasConfig: isInitialized,
    };
  }
  
  const extra = Constants.expoConfig?.extra;
  return {
    webClientId: extra?.GOOGLE_SIGN_IN_WEB_CLIENT_ID ? 'Configured' : 'Not configured',
    hasConfig: !!extra?.GOOGLE_SIGN_IN_WEB_CLIENT_ID,
  };
};

export { isInitialized }; 
