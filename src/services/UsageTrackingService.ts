import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UsageData {
  firstOpenAt: number;
  totalUsageTime: number;
  sessionCount: number;
  lastSessionStart: number | null;
  inAppReviewShown: boolean;
  inAppReviewRequested: boolean;
  lastInAppReviewDate: number | null;
}

const USAGE_KEY = 'inferra_usage_data';
const SESSION_TIMEOUT = 30 * 60 * 1000;

class UsageTrackingService {
  private currentSession: {
    startTime: number;
    lastActivityTime: number;
  } | null = null;

  async getUsageData(): Promise<UsageData> {
    try {
      const data = await AsyncStorage.getItem(USAGE_KEY);
      if (!data) {
        const defaultData: UsageData = {
          firstOpenAt: Date.now(),
          totalUsageTime: 0,
          sessionCount: 0,
          lastSessionStart: null,
          inAppReviewShown: false,
          inAppReviewRequested: false,
          lastInAppReviewDate: null,
        };
        await this.saveUsageData(defaultData);
        return defaultData;
      }
      return JSON.parse(data);
    } catch (error) {
      return {
        firstOpenAt: Date.now(),
        totalUsageTime: 0,
        sessionCount: 0,
        lastSessionStart: null,
        inAppReviewShown: false,
        inAppReviewRequested: false,
        lastInAppReviewDate: null,
      };
    }
  }

  private async saveUsageData(data: UsageData): Promise<void> {
    try {
      await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(data));
    } catch (error) {
    }
  }

  async startSession(): Promise<void> {
    const now = Date.now();
    this.currentSession = {
      startTime: now,
      lastActivityTime: now,
    };

    const usageData = await this.getUsageData();
    usageData.sessionCount += 1;
    usageData.lastSessionStart = now;
    await this.saveUsageData(usageData);
  }

  async endSession(): Promise<void> {
    if (!this.currentSession) return;

    const sessionDuration = Date.now() - this.currentSession.startTime;
    const usageData = await this.getUsageData();
    usageData.totalUsageTime += sessionDuration;
    await this.saveUsageData(usageData);

    this.currentSession = null;
  }

  async updateActivity(): Promise<void> {
    if (this.currentSession) {
      const now = Date.now();
      
      if (now - this.currentSession.lastActivityTime > SESSION_TIMEOUT) {
        await this.endSession();
        await this.startSession();
      } else {
        this.currentSession.lastActivityTime = now;
      }
    }
  }

  async shouldShowInAppReview(): Promise<boolean> {
    const usageData = await this.getUsageData();
    
    if (usageData.inAppReviewRequested) {
      return false;
    }

    if (usageData.totalUsageTime < 15 * 60 * 1000) {
      return false;
    }

    if (usageData.lastInAppReviewDate) {
      const daysSinceLastReview = (Date.now() - usageData.lastInAppReviewDate) / (24 * 60 * 60 * 1000);
      if (daysSinceLastReview < 30) {
        return false;
      }
    }

    return true;
  }

  async markInAppReviewShown(): Promise<void> {
    const usageData = await this.getUsageData();
    usageData.inAppReviewShown = true;
    usageData.lastInAppReviewDate = Date.now();
    await this.saveUsageData(usageData);
  }

  async markInAppReviewRequested(): Promise<void> {
    const usageData = await this.getUsageData();
    usageData.inAppReviewRequested = true;
    usageData.lastInAppReviewDate = Date.now();
    await this.saveUsageData(usageData);
  }

  async getTotalUsageTime(): Promise<number> {
    const usageData = await this.getUsageData();
    return usageData.totalUsageTime;
  }
}

export const usageTrackingService = new UsageTrackingService();
