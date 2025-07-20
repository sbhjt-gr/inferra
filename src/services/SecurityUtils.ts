import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

export const TRUSTED_EMAIL_PROVIDERS = [
  'gmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'zohomail.com',
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'gmx.com',
  'gmx.us',
  'gmx.co.uk',
  'aol.com'
];

export const AUTH_ATTEMPTS_KEY = 'inferra_secure_auth_attempts';
export const MAX_AUTH_ATTEMPTS = 5;
export const AUTH_LOCKOUT_DURATION = 15 * 60 * 1000;
export const PASSWORD_MIN_LENGTH = 8;

export const validateEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return email.length <= 320 && emailRegex.test(email);
};

export const isEmailFromTrustedProvider = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  
  const domain = email.split('@')[1]?.toLowerCase();
  return TRUSTED_EMAIL_PROVIDERS.includes(domain);
};

export const validatePassword = (password: string, strict: boolean = false): { valid: boolean; message?: string; isWeak?: boolean } => {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }
  
  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters' };
  }
  
  if (!strict) {
    return { valid: true };
  }
  
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: true, isWeak: true, message: `Your password is weak. Consider using at least ${PASSWORD_MIN_LENGTH} characters` };
  }
  
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  if (!(hasUpperCase && hasLowerCase && (hasNumbers || hasSpecialChars))) {
    return { 
      valid: true, 
      isWeak: true,
      message: 'Your password is weak. Consider including uppercase, lowercase, and numbers or special characters' 
    };
  }
  
  return { valid: true };
};

export const validateName = (name: string): boolean => {
  if (!name || typeof name !== 'string') return false;
  
  if (name.length > 100) return false;
  
  const nameRegex = /^[a-zA-Z0-9\s\-'\.]+$/;
  return nameRegex.test(name);
};

export const checkRateLimiting = async (): Promise<boolean> => {
  try {
    const attemptsData = await AsyncStorage.getItem(AUTH_ATTEMPTS_KEY);
    
    if (!attemptsData) {
      return true;
    }
    
    const { attempts, timestamp } = JSON.parse(attemptsData);
    const now = Date.now();
    
    if (now - timestamp > AUTH_LOCKOUT_DURATION) {
      await AsyncStorage.removeItem(AUTH_ATTEMPTS_KEY);
      return true;
    }
    
    if (attempts >= MAX_AUTH_ATTEMPTS) {
      return false;
    }
    
    return true;
  } catch (error) {
    return true;
  }
};

export const incrementAuthAttempts = async (): Promise<void> => {
  try {
    const attemptsData = await AsyncStorage.getItem(AUTH_ATTEMPTS_KEY);
    
    const now = Date.now();
    
    if (!attemptsData) {
      const newData = JSON.stringify({ attempts: 1, timestamp: now });
      await AsyncStorage.setItem(AUTH_ATTEMPTS_KEY, newData);
      return;
    }
    
    const { attempts, timestamp } = JSON.parse(attemptsData);
    
    if (now - timestamp > AUTH_LOCKOUT_DURATION) {
      const newData = JSON.stringify({ attempts: 1, timestamp: now });
      await AsyncStorage.setItem(AUTH_ATTEMPTS_KEY, newData);
      return;
    }
    
    const newData = JSON.stringify({ attempts: attempts + 1, timestamp });
    await AsyncStorage.setItem(AUTH_ATTEMPTS_KEY, newData);
  } catch (error) {
    // do nothing
  }
};

export const resetAuthAttempts = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(AUTH_ATTEMPTS_KEY);
  } catch (error) {
    // do nothing
  }
};

export const getIpAddress = async (): Promise<{ip: string | null, error?: string}> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    if (response.ok) {
      const data = await response.json();
      return { ip: data.ip };
    } else {
      return { ip: null, error: 'Failed to fetch IP address' };
    }
  } catch (error) {
    return { ip: null, error: 'Network error when fetching IP' };
  }
};

export const getGeoLocationFromIp = async (ip: string): Promise<{geo: any | null, error?: string}> => {
  try {
    const response = await fetch(`https://ipinfo.io/${ip}/json`);
    if (response.ok) {
      const data = await response.json();
      const geoData = {
        city: data.city,
        region: data.region,
        country: data.country,
        loc: data.loc
      };
      return { geo: geoData };
    } else {
      return { geo: null, error: 'Failed to get location data' };
    }
  } catch (error) {
    return { geo: null, error: 'Network error when fetching location' };
  }
};

export const getDeviceInfo = async (): Promise<any> => {
  try {
    return {
      platform: Platform.OS,
      osVersion: Device.osVersion || Platform.Version.toString(),
      deviceType: Device.deviceType || 'Unknown',
      deviceBrand: Device.brand || 'Unknown',
    };
  } catch (error) {
    return { error: 'Failed to get device information' };
  }
};

export const storeUserSecurityInfo = async (userId: string): Promise<boolean> => {
  try {
    const deviceInfoResult = await getDeviceInfo();
    const ipResult = await getIpAddress();
    
    let geoData = null;
    if (ipResult.ip) {
      const geoResult = await getGeoLocationFromIp(ipResult.ip);
      geoData = geoResult.geo;
    }

    const securityRecord = {
      userId,
      timestamp: new Date().toISOString(),
      deviceInfo: deviceInfoResult.deviceInfo,
      ipAddress: ipResult.ip,
      geoLocation: geoData,
      error: deviceInfoResult.error || ipResult.error
    };

    // For now, just store locally until we have proper Firestore setup
    const key = `security_${userId}_${Date.now()}`;
    await AsyncStorage.setItem(key, JSON.stringify(securityRecord));
    
    return true;
  } catch (error) {
    console.error('Error storing user security info:', error);
    return false;
  }
}; 