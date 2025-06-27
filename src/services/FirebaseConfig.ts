import { Platform } from 'react-native';
import { getApp, initializeApp } from '@react-native-firebase/app';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  [key: string]: string;
}

let isInitialized = false;

export const initializeFirebase = async (): Promise<void> => {
  try {
    if (__DEV__) {
      console.log('Starting Firebase initialization...');
    }
    
    const extra = Constants.expoConfig?.extra;
    
    if (__DEV__) {
      console.log('Environment config loaded:', !!extra);
      console.log('Firebase Project ID present:', !!extra?.FIREBASE_PROJECT_ID);
    }
    
    if (!extra?.FIREBASE_PROJECT_ID) {
      if (__DEV__) {
        console.error('Firebase configuration missing. Check your .env file and app.config.js');
        console.error('Available extra config:', extra);
      }
      throw new Error('System configuration error');
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
      
      if (error.code === 'app/no-app' || error.message?.includes('No Firebase App') || error.message?.includes('has been created')) {
        if (__DEV__) {
          console.log('No existing Firebase app found, creating new one...');
          console.log('Platform:', Platform.OS);
        }
        
        const requiredKeys = Platform.OS === 'ios' 
          ? ['FIREBASE_PROJECT_ID', 'FIREBASE_STORAGE_BUCKET', 'FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_IOS_API_KEY', 'FIREBASE_IOS_APP_ID']
          : ['FIREBASE_PROJECT_ID', 'FIREBASE_STORAGE_BUCKET', 'FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_ANDROID_API_KEY', 'FIREBASE_ANDROID_APP_ID'];
        
        const missingKeys = requiredKeys.filter(key => !extra[key]);
        
        if (missingKeys.length > 0) {
          if (__DEV__) {
            console.error('Missing Firebase configuration keys:', missingKeys);
            console.error('Platform:', Platform.OS);
            console.error('Available Firebase keys:', Object.keys(extra).filter(key => key.startsWith('FIREBASE')));
          }
          throw new Error('System configuration error');
        }

        if (__DEV__) {
          console.log('All required configuration keys present');
        }

        const firebaseConfig: FirebaseConfig = {
          projectId: extra.FIREBASE_PROJECT_ID,
          storageBucket: extra.FIREBASE_STORAGE_BUCKET,
          messagingSenderId: extra.FIREBASE_MESSAGING_SENDER_ID,
          authDomain: extra.FIREBASE_AUTH_DOMAIN,
          databaseURL: `https://${extra.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`,
          apiKey: Platform.OS === 'ios' ? extra.FIREBASE_IOS_API_KEY : extra.FIREBASE_ANDROID_API_KEY,
          appId: Platform.OS === 'ios' ? extra.FIREBASE_IOS_APP_ID : extra.FIREBASE_ANDROID_APP_ID,
        };

        if (Platform.OS === 'ios') {
          firebaseConfig.clientId = extra.FIREBASE_IOS_CLIENT_ID;
          firebaseConfig.reversedClientId = extra.FIREBASE_IOS_REVERSED_CLIENT_ID;
          firebaseConfig.bundleId = extra.FIREBASE_IOS_BUNDLE_ID;
        }

        if (__DEV__) {
          console.log('Firebase config prepared for platform:', Platform.OS);
          console.log('Config keys:', Object.keys(firebaseConfig));
          console.log('Project ID:', firebaseConfig.projectId);
          console.log('API Key present:', !!firebaseConfig.apiKey);
          console.log('App ID present:', !!firebaseConfig.appId);
        }

        try {
          app = await initializeApp(firebaseConfig);
          isInitialized = true;
          
          if (__DEV__) {
            console.log('Firebase app initialized successfully');
            console.log('App name:', app.name);
            console.log('Project ID from app:', app.options.projectId);
          }
        } catch (initError: any) {
          if (__DEV__) {
            console.error('Firebase initializeApp failed:', initError);
            console.error('Config used:', firebaseConfig);
          }
          throw initError;
        }
      } else {
        if (__DEV__) {
          console.error('Firebase getApp error (unexpected):', error);
        }
        throw error;
      }
    }

    if (!extra.GOOGLE_SIGN_IN_WEB_CLIENT_ID) {
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