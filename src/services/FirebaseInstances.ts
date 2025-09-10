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
        }
      } catch (error: any) {
        if (__DEV__) {
          if (error.code === 'failed-precondition') {
          } else if (error.code === 'unimplemented') {
          }
        }
      }
    }
    
    return firestoreInstance;
  } catch (error) {
    if (__DEV__) {
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
