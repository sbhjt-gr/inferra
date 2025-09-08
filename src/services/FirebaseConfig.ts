import { Platform } from 'react-native';
import { getApp, initializeApp } from '@react-native-firebase/app';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

let isInitialized = false;

export const initializeFirebase = async (): Promise<void> => {
  try {
    if (__DEV__) {
      console.log('Starting Firebase initialization...');
    }

    let app;
    try {
      app = getApp();
      isInitialized = true;
      if (__DEV__) {
        console.log('Firebase app already initialized');
      }
      return;
    } catch (error: any) {
      if (__DEV__) {
        console.log('getApp() error:', error.message);
        console.log('Error code:', error.code);
      }
      
      if (error.code === 'app/no-app' || error.message?.includes('No Firebase App')) {
        if (__DEV__) {
          console.log('Firebase app will be automatically initialized from google-services.json');
          console.log('Platform:', Platform.OS);
        }
        
        try {
          app = getApp('[DEFAULT]');
          isInitialized = true;
          
          if (__DEV__) {
            console.log('Firebase app accessed successfully');
            console.log('App name:', app.name);
            console.log('Project ID from app:', app.options.projectId);
          }
        } catch (secondError: any) {
          if (__DEV__) {
            console.error('Firebase app access failed:', secondError);
            console.error('Make sure google-services.json and GoogleService-Info.plist are properly configured');
          }
          throw secondError;
        }
      } else {
        if (__DEV__) {
          console.error('Firebase getApp error (unexpected):', error);
        }
        throw error;
      }
    }

    const extra = Constants.expoConfig?.extra;
    if (!extra?.GOOGLE_SIGN_IN_WEB_CLIENT_ID) {
      if (__DEV__) {
        console.warn('Google Sign-In Web Client ID not found - Google auth will not work');
      }
    } else {
      try {
        if (__DEV__) {
          console.log('Configuring Google Sign-In with Web Client ID...');
          console.log('Web Client ID present:', !!extra.GOOGLE_SIGN_IN_WEB_CLIENT_ID);
        }
        
        await GoogleSignin.configure({
          webClientId: extra.GOOGLE_SIGN_IN_WEB_CLIENT_ID,
        });
        
        if (__DEV__) {
          console.log('Google Sign-In configured successfully');
          
          try {
            const isConfigured = await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
            console.log('Google Play Services available:', isConfigured);
          } catch (playServicesError) {
            console.warn('Google Play Services check failed:', playServicesError);
          }
        }
      } catch (googleError) {
        if (__DEV__) {
          console.error('Google Sign-In configuration failed:', googleError);
        }
      }
    }

    if (__DEV__) {
      console.log('Firebase initialization completed successfully');
    }

  } catch (error) {
    if (__DEV__) {
      console.error('Firebase initialization failed:', error);
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