export interface DataCollectionSettings {
  locationTracking: boolean;
  usageAnalytics: boolean;
  securityLogging: boolean;
  chatHistoryStorage: boolean;
  crashReporting: boolean;
}

export interface AgeVerification {
  birthDate: string;
  isVerified: boolean;
  isMinor: boolean;
}

export interface PrivacyConsent {
  dataCollection: boolean;
  aiContentGeneration: boolean;
  thirdPartyServices: boolean;
  analytics: boolean;
  timestamp: string;
}

export const DEFAULT_DATA_COLLECTION_SETTINGS: DataCollectionSettings = {
  locationTracking: false,
  usageAnalytics: false,
  securityLogging: true,
  chatHistoryStorage: true,
  crashReporting: true,
};

export const MINIMUM_AGE = 13;
