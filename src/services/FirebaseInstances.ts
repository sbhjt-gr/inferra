import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';
import { isInitialized } from './FirebaseConfig';

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
    return getFirestore();
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