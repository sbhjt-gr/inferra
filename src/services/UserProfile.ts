import { Platform } from 'react-native';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp 
} from '@react-native-firebase/firestore';
import { UserData } from './AuthStorage';
import { 
  isEmailFromTrustedProvider, 
  getIpAddress, 
  getGeoLocationFromIp, 
  getDeviceInfo, 
  storeUserSecurityInfo 
} from './SecurityUtils';

const getFirebaseServices = async () => {
  const { getFirebaseServices } = await import('./FirebaseService');
  return getFirebaseServices();
};

export const createUserProfile = async (user: FirebaseAuthTypes.User, name: string): Promise<void> => {
  try {
    const ipData = await getIpAddress();
    let geoData = { geo: null };
    if (ipData.ip) {
      geoData = await getGeoLocationFromIp(ipData.ip);
    }
    const deviceInfo = await getDeviceInfo();
    
    const isTrustedEmail = isEmailFromTrustedProvider(user.email || '');
    
    const firestore = getFirestore();
    const userDocRef = doc(firestore, 'users', user.uid);
    const existingDoc = await getDoc(userDocRef);
    
    const userProfile: any = {
      uid: user.uid,
      email: user.email,
      displayName: name,
      emailVerified: user.emailVerified,
      photoURL: user.photoURL,
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      trustedEmail: isTrustedEmail,
      registrationInfo: {
        platform: Platform.OS,
        ipAddress: ipData.ip,
        geolocation: geoData.geo,
        deviceInfo: deviceInfo,
        timestamp: serverTimestamp(),
      },
      settings: {
        emailNotifications: true,
        pushNotifications: true,
      },
      status: {
        isActive: true,
        lastActive: serverTimestamp(),
      }
    };
    
    if (!existingDoc.exists()) {
      userProfile.createdAt = serverTimestamp();
    }
    
    await setDoc(userDocRef, userProfile, { merge: true });
    
    await storeUserSecurityInfo(
      user.uid, 
      ipData, 
      geoData, 
      deviceInfo
    );
  } catch (error) {
  }
};

export const getUserProfile = async (uid: string): Promise<UserData | null> => {
  try {
    const firestore = getFirestore();
    const userDocRef = doc(firestore, 'users', uid);
    
    try {
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        const { auth } = await getFirebaseServices();
        const currentUser = auth().currentUser;
        
        const userData: UserData = {
          uid: data!.uid,
          email: data!.email,
          emailVerified: (currentUser && currentUser.uid === uid) ? currentUser.emailVerified : (data!.emailVerified || false),
          displayName: data!.displayName,
          lastLoginAt: data!.lastLoginAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          createdAt: data!.createdAt,
          updatedAt: data!.updatedAt,
          trustedEmail: data!.trustedEmail,
          settings: data!.settings,
          status: data!.status,
          registrationInfo: data!.registrationInfo,
          lastLoginInfo: data!.lastLoginInfo
        };
        
        if (__DEV__) {
          const fromCache = userDoc.metadata.fromCache;
          const hasPendingWrites = userDoc.metadata.hasPendingWrites;
        }
        
        return userData;
      }
      
      return null;
    } catch (networkError: any) {
      if (__DEV__) {
      }
      
      try {
        const cachedDoc = await getDoc(userDocRef);
        if (cachedDoc.exists() && cachedDoc.metadata.fromCache) {
          const data = cachedDoc.data();
          const { auth } = await getFirebaseServices();
          const currentUser = auth().currentUser;
          
          if (__DEV__) {
          }
          
          return {
            uid: data!.uid,
            email: data!.email,
            emailVerified: (currentUser && currentUser.uid === uid) ? currentUser.emailVerified : (data!.emailVerified || false),
            displayName: data!.displayName,
            lastLoginAt: data!.lastLoginAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            createdAt: data!.createdAt,
            updatedAt: data!.updatedAt,
            trustedEmail: data!.trustedEmail,
            settings: data!.settings,
            status: data!.status,
            registrationInfo: data!.registrationInfo,
            lastLoginInfo: data!.lastLoginInfo
          };
        }
      } catch (cacheError) {
        if (__DEV__) {
        }
      }
      
      throw networkError;
    }
  } catch (error) {
    if (__DEV__) {
    }
    return null;
  }
};

export const updateEmailVerificationStatus = async (uid: string, emailVerified: boolean): Promise<void> => {
  try {
    const firestore = getFirestore();
    await setDoc(doc(firestore, 'users', uid), {
      emailVerified: emailVerified,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    if (__DEV__) {
    }
  }
};

export const updateUserLoginInfo = async (uid: string): Promise<void> => {
  try {
    const firestore = getFirestore();
    const ipData = await getIpAddress();
    let geoData = { geo: null };
    if (ipData.ip) {
      geoData = await getGeoLocationFromIp(ipData.ip);
    }
    const deviceInfo = await getDeviceInfo();
    
    await setDoc(doc(firestore, 'users', uid), {
      uid: uid,
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      'status.isActive': true,
      'status.lastActive': serverTimestamp(),
      lastLoginInfo: {
        platform: Platform.OS,
        ipAddress: ipData.ip,
        geolocation: geoData.geo,
        deviceInfo: deviceInfo,
        timestamp: serverTimestamp(),
      }
    }, { merge: true });
    
    await storeUserSecurityInfo(uid, ipData, geoData, deviceInfo);
  } catch (error) {
    if (__DEV__) {
    }
  }
}; 
