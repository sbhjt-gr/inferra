import AsyncStorage from '@react-native-async-storage/async-storage';
import { DataCollectionSettings, AgeVerification, PrivacyConsent, DEFAULT_DATA_COLLECTION_SETTINGS } from '../types/privacy';

const DATA_COLLECTION_KEY = 'inferra_data_collection_settings';
const AGE_VERIFICATION_KEY = 'inferra_age_verification';
const PRIVACY_CONSENT_KEY = 'inferra_privacy_consent';

export const validateAge = (birthDate: string, minimumAge: number): { isValid: boolean; isMinor: boolean; age: number } => {
  try {
    const birth = new Date(birthDate);
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate()) 
      ? age - 1 
      : age;
    
    return {
      isValid: actualAge >= minimumAge,
      isMinor: actualAge < 18,
      age: actualAge
    };
  } catch (error) {
    return { isValid: false, isMinor: true, age: 0 };
  }
};

export const storeAgeVerification = async (verification: AgeVerification): Promise<void> => {
  try {
    await AsyncStorage.setItem(AGE_VERIFICATION_KEY, JSON.stringify(verification));
  } catch (error) {
    console.error('Failed to store age verification:', error);
  }
};

export const getAgeVerification = async (): Promise<AgeVerification | null> => {
  try {
    const stored = await AsyncStorage.getItem(AGE_VERIFICATION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Failed to get age verification:', error);
    return null;
  }
};

export const storeDataCollectionSettings = async (settings: DataCollectionSettings): Promise<void> => {
  try {
    await AsyncStorage.setItem(DATA_COLLECTION_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to store data collection settings:', error);
  }
};

export const getDataCollectionSettings = async (): Promise<DataCollectionSettings> => {
  try {
    const stored = await AsyncStorage.getItem(DATA_COLLECTION_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_DATA_COLLECTION_SETTINGS;
  } catch (error) {
    console.error('Failed to get data collection settings:', error);
    return DEFAULT_DATA_COLLECTION_SETTINGS;
  }
};

export const storePrivacyConsent = async (consent: PrivacyConsent): Promise<void> => {
  try {
    await AsyncStorage.setItem(PRIVACY_CONSENT_KEY, JSON.stringify(consent));
  } catch (error) {
    console.error('Failed to store privacy consent:', error);
  }
};

export const getPrivacyConsent = async (): Promise<PrivacyConsent | null> => {
  try {
    const stored = await AsyncStorage.getItem(PRIVACY_CONSENT_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Failed to get privacy consent:', error);
    return null;
  }
};

export const deleteAllUserData = async (): Promise<void> => {
  try {
    const keys = [
      DATA_COLLECTION_KEY,
      AGE_VERIFICATION_KEY,
      PRIVACY_CONSENT_KEY,
      'inferra_secure_user_auth_state',
      'inferra_chats',
      'inferra_current_chat_id',
      '@remote_models_enabled',
      'inferra_secure_auth_attempts'
    ];
    
    await AsyncStorage.multiRemove(keys);
  } catch (error) {
    console.error('Failed to delete user data:', error);
    throw error;
  }
};
