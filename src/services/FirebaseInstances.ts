import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';
import { isInitialized } from './FirebaseConfig';

let firestoreInstance: any = null;
let persistenceEnabled = false;

const getAuthInstance = () => {
  try {
    return getAuth();
  } catch (error) {
    if (__DEV__) {
      console.error('Firebase Auth not initialized. Make sure initializeFirebase() is called first.');
    }
    throw new Error('Authentication service unavailable');
  }
};

const getFirestoreInstance = () => {
  try {
    if (firestoreInstance) {
      return firestoreInstance;
    }

    firestoreInstance = getFirestore();
    
    if (!persistenceEnabled) {
      try {
        firestoreInstance.enablePersistence({
          cacheSizeBytes: 50 * 1024 * 1024,
          synchronizeTabs: false
        });
        persistenceEnabled = true;
        
        if (__DEV__) {
          console.log('Firestore persistence enabled successfully');
        }
      } catch (error: any) {
        if (__DEV__) {
          console.warn('Firestore persistence failed:', error.code);
          if (error.code === 'failed-precondition') {
            console.warn('Multiple tabs open, persistence can only be enabled in one tab');
          } else if (error.code === 'unimplemented') {
            console.warn('Current browser does not support persistence');
          }
        }
      }
    }
    
    return firestoreInstance;
  } catch (error) {
    if (__DEV__) {
      console.error('Firebase Firestore not initialized. Make sure initializeFirebase() is called first.');
    }
    throw new Error('Database service unavailable');
  }
};

export const testFirebaseConnection = async (): Promise<{ connected: boolean; error?: string }> => {
  try {
    if (!isInitialized) {
      return { connected: false, error: 'Service not available' };
    }
    
    const currentUser = getAuthInstance().currentUser;
    if (currentUser) {
      await currentUser.reload();
    }
    
    return { connected: true };
  } catch (error: any) {
    if (__DEV__) {
      console.error('Firebase test error:', error);
    }
    return { connected: false, error: 'Connection test failed' };
  }
};

export const getFirebaseServices = () => {
  return {
    auth: getAuthInstance,
    firestore: getFirestoreInstance,
    initialized: isInitialized
  };
};

export { getAuthInstance, getFirestoreInstance }; 