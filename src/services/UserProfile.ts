import { Platform } from 'react-native';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { UserData } from './AuthStorage';
import { 
  isEmailFromTrustedProvider, 
  getIpAddress, 
  getGeoLocationFromIp, 
  getDeviceInfo, 
  storeUserSecurityInfo 
} from './SecurityUtils';

export const createUserProfile = async (user: FirebaseAuthTypes.User, name: string): Promise<void> => {
  try {
    const ipData = await getIpAddress();
    let geoData = { geo: null };
    if (ipData.ip) {
      geoData = await getGeoLocationFromIp(ipData.ip);
    }
    const deviceInfo = await getDeviceInfo();
    
    const isTrustedEmail = isEmailFromTrustedProvider(user.email || '');
    
    const userDocRef = firestore().collection('users').doc(user.uid);
    const existingDoc = await userDocRef.get();
    
    const userProfile: any = {
      uid: user.uid,
      email: user.email,
      displayName: name,
      emailVerified: user.emailVerified,
      photoURL: user.photoURL,
      updatedAt: firestore.FieldValue.serverTimestamp(),
      lastLoginAt: firestore.FieldValue.serverTimestamp(),
      trustedEmail: isTrustedEmail,
      registrationInfo: {
        platform: Platform.OS,
        ipAddress: ipData.ip,
        geolocation: geoData.geo,
        deviceInfo: deviceInfo,
        timestamp: firestore.FieldValue.serverTimestamp(),
      },
      settings: {
        emailNotifications: true,
        pushNotifications: true,
      },
      status: {
        isActive: true,
        lastActive: firestore.FieldValue.serverTimestamp(),
      }
    };
    
    if (!existingDoc.exists()) {
      userProfile.createdAt = firestore.FieldValue.serverTimestamp();
    }
    
    await userDocRef.set(userProfile, { merge: true });
    
    await storeUserSecurityInfo(
      user.uid, 
      ipData, 
      geoData, 
      deviceInfo
    );
  } catch (error) {
    // do nothing
  }
};

export const getUserProfile = async (uid: string): Promise<UserData | null> => {
  try {
    const userDocRef = firestore().collection('users').doc(uid);
    const userDoc = await userDocRef.get();
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      const currentUser = auth().currentUser;
      
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
    
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
};

export const updateEmailVerificationStatus = async (uid: string, emailVerified: boolean): Promise<void> => {
  try {
    const userDocRef = firestore().collection('users').doc(uid);
    await userDocRef.set({
      emailVerified: emailVerified,
      updatedAt: firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Error updating email verification status:', error);
  }
};

export const updateUserLoginInfo = async (uid: string): Promise<void> => {
  try {
    const ipData = await getIpAddress();
    let geoData = { geo: null };
    if (ipData.ip) {
      geoData = await getGeoLocationFromIp(ipData.ip);
    }
    const deviceInfo = await getDeviceInfo();
    
    await firestore().collection('users').doc(uid).set({
      uid: uid,
      lastLoginAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
      'status.isActive': true,
      'status.lastActive': firestore.FieldValue.serverTimestamp(),
      lastLoginInfo: {
        platform: Platform.OS,
        ipAddress: ipData.ip,
        geolocation: geoData.geo,
        deviceInfo: deviceInfo,
        timestamp: firestore.FieldValue.serverTimestamp(),
      }
    }, { merge: true });
    
    await storeUserSecurityInfo(uid, ipData, geoData, deviceInfo);
  } catch (error) {
    console.error('Error updating user login info:', error);
  }
}; 