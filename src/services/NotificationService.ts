import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { downloadNotificationService } from './DownloadNotificationService';

interface StoredNotification {
  id: string;
  title: string;
  description: string;
  timestamp: number;
  type: string;
  downloadId?: number;
}

class NotificationService {
  private notificationIds: Record<number, string> = {};
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      // Load saved notification IDs
      const savedIds = await AsyncStorage.getItem('downloadNotificationIds');
      if (savedIds) {
        this.notificationIds = JSON.parse(savedIds);
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing notifications:', error);
      // Still mark as initialized to prevent repeated attempts
      this.isInitialized = true;
    }
  }

  private async storeNotification(title: string, description: string, type: string, downloadId?: number) {
    try {
      // Get existing notifications
      const existingNotificationsJson = await AsyncStorage.getItem('downloadNotifications');
      let notifications: StoredNotification[] = [];
      
      if (existingNotificationsJson) {
        notifications = JSON.parse(existingNotificationsJson);
      }
      
      // Add new notification
      const newNotification: StoredNotification = {
        id: Date.now().toString(),
        title,
        description,
        timestamp: Date.now(),
        type,
        downloadId
      };
      
      // Add to the beginning of the array (newest first)
      notifications.unshift(newNotification);
      
      // Limit to 50 notifications to prevent excessive storage
      if (notifications.length > 50) {
        notifications = notifications.slice(0, 50);
      }
      
      // Save back to AsyncStorage
      await AsyncStorage.setItem('downloadNotifications', JSON.stringify(notifications));
    } catch (error) {
      console.error('Error storing notification:', error);
    }
  }

  async showDownloadStartedNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();
    
    if (Platform.OS === 'android') {
      await downloadNotificationService.showNotification(modelName, downloadId, 0);
    }
    
    // Store for history
    await this.storeNotification(
      'Download Started',
      `${modelName} download has started`,
      'download_started',
      downloadId
    );
  }

  async updateDownloadProgressNotification(
    modelName: string,
    downloadId: number,
    progress: number,
    bytesDownloaded: number,
    totalBytes: number
  ): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'android') {
      await downloadNotificationService.updateProgress(downloadId, progress);
    }
    
    // Only store progress notifications at certain intervals to avoid spam
    if (progress % 25 === 0) { // Store at 25%, 50%, 75%, 100%
      const formattedDownloaded = this.formatBytes(bytesDownloaded);
      const formattedTotal = this.formatBytes(totalBytes);
      
      await this.storeNotification(
        `Downloading ${modelName}`,
        `${progress}% complete (${formattedDownloaded} of ${formattedTotal})`,
        'download_progress',
        downloadId
      );
    }
  }

  async showDownloadCompletedNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'android') {
      await downloadNotificationService.showNotification(modelName, downloadId, 100);
    }
    
    // Store for history
    await this.storeNotification(
      'Download Complete',
      `${modelName} has been downloaded successfully`,
      'download_completed',
      downloadId
    );
  }

  async showDownloadFailedNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'android') {
      await downloadNotificationService.cancelNotification(downloadId);
    }
    
    // Store for history
    await this.storeNotification(
      'Download Failed',
      `${modelName} download has failed`,
      'download_failed',
      downloadId
    );
  }

  async showDownloadPausedNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();
    
    // Store for history only - no visual notification needed
    await this.storeNotification(
      'Download Paused',
      `${modelName} download has been paused`,
      'download_paused',
      downloadId
    );
  }

  async showDownloadPauseUnavailableNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();
    
    // Store for history only - no visual notification needed
    await this.storeNotification(
      'Pause Not Available',
      `Pausing ${modelName} download is not supported`,
      'download_pause_unavailable',
      downloadId
    );
  }

  async showDownloadResumedNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();
    
    // Store for history only - no visual notification needed
    await this.storeNotification(
      'Download Resumed',
      `${modelName} download has been resumed`,
      'download_resumed',
      downloadId
    );
  }

  async showDownloadResumeUnavailableNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();
    
    // Store for history only - no visual notification needed
    await this.storeNotification(
      'Resume Not Available',
      `Resuming ${modelName} download is not supported`,
      'download_resume_unavailable',
      downloadId
    );
  }

  async showDownloadCancelledNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'android') {
      await downloadNotificationService.cancelNotification(downloadId);
    }
    
    // Store for history
    await this.storeNotification(
      'Download Cancelled',
      `${modelName} download has been cancelled`,
      'download_cancelled',
      downloadId
    );
  }

  async showGenericNotification(title: string, body: string, modelName: string, downloadId: number): Promise<void> {
    await this.initialize();
    
    // Store for history only - no visual notification needed
    await this.storeNotification(
      title,
      body,
      'generic',
      downloadId
    );
  }

  async cancelDownloadNotification(downloadId: number): Promise<void> {
    if (Platform.OS === 'android') {
      await downloadNotificationService.cancelNotification(downloadId);
    }
  }

  private async saveNotificationIds(): Promise<void> {
    try {
      await AsyncStorage.setItem('downloadNotificationIds', JSON.stringify(this.notificationIds));
    } catch (error) {
      console.error('Error saving notification IDs:', error);
    }
  }

  private formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}

export const notificationService = new NotificationService(); 