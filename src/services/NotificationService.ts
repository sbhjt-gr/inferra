import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure notification handling - use a try/catch to handle potential errors
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (error) {
  console.warn('Error setting notification handler:', error);
}

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
      // Request permissions (required for iOS)
      if (Platform.OS === 'ios') {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Notification permissions not granted');
          return;
        }
      }

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

    try {
      // Only attempt to show notification if we're initialized
      if (this.isInitialized) {
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Download Started',
            body: `${modelName} download has started`,
            data: { downloadId, type: 'download_started' },
          },
          trigger: null, // Show immediately
        });

        this.notificationIds[downloadId] = notificationId;
        await this.saveNotificationIds();
      }
      
      // Always store for history, even if notification fails
      await this.storeNotification(
        'Download Started',
        `${modelName} download has started`,
        'download_started',
        downloadId
      );
    } catch (error) {
      console.error('Error showing download started notification:', error);
      // Still store the notification in history
      await this.storeNotification(
        'Download Started',
        `${modelName} download has started`,
        'download_started',
        downloadId
      );
    }
  }

  async updateDownloadProgressNotification(
    modelName: string,
    downloadId: number,
    progress: number,
    bytesDownloaded: number,
    totalBytes: number
  ): Promise<void> {
    await this.initialize();

    try {
      // Only attempt to show notification if we're initialized
      if (this.isInitialized) {
        // Cancel previous notification for this download
        if (this.notificationIds[downloadId]) {
          try {
            await Notifications.cancelScheduledNotificationAsync(this.notificationIds[downloadId]);
          } catch (error) {
            console.warn('Error cancelling previous notification:', error);
          }
        }

        const formattedDownloaded = this.formatBytes(bytesDownloaded);
        const formattedTotal = this.formatBytes(totalBytes);

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: `Downloading ${modelName}`,
            body: `${progress}% complete (${formattedDownloaded} of ${formattedTotal})`,
            data: { downloadId, type: 'download_progress', progress },
          },
          trigger: null, // Show immediately
        });

        this.notificationIds[downloadId] = notificationId;
        await this.saveNotificationIds();
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
    } catch (error) {
      console.error('Error updating download progress notification:', error);
      // Still store the notification in history if it's a milestone
      if (progress % 25 === 0) {
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
  }

  async showDownloadCompletedNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();

    try {
      // Only attempt to show notification if we're initialized
      if (this.isInitialized) {
        // Cancel previous notification for this download
        if (this.notificationIds[downloadId]) {
          try {
            await Notifications.cancelScheduledNotificationAsync(this.notificationIds[downloadId]);
          } catch (error) {
            console.warn('Error cancelling previous notification:', error);
          }
        }

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Download Complete',
            body: `${modelName} has been downloaded successfully`,
            data: { downloadId, type: 'download_completed' },
          },
          trigger: null, // Show immediately
        });

        this.notificationIds[downloadId] = notificationId;
        await this.saveNotificationIds();

        // Remove notification ID after a delay
        setTimeout(async () => {
          delete this.notificationIds[downloadId];
          await this.saveNotificationIds();
        }, 5000);
      }
      
      // Always store for history, even if notification fails
      await this.storeNotification(
        'Download Complete',
        `${modelName} has been downloaded successfully`,
        'download_completed',
        downloadId
      );
    } catch (error) {
      console.error('Error showing download completed notification:', error);
      // Still store the notification in history
      await this.storeNotification(
        'Download Complete',
        `${modelName} has been downloaded successfully`,
        'download_completed',
        downloadId
      );
    }
  }

  async showDownloadFailedNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();

    try {
      // Only attempt to show notification if we're initialized
      if (this.isInitialized) {
        // Cancel previous notification for this download
        if (this.notificationIds[downloadId]) {
          try {
            await Notifications.cancelScheduledNotificationAsync(this.notificationIds[downloadId]);
          } catch (error) {
            console.warn('Error cancelling previous notification:', error);
          }
        }

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Download Failed',
            body: `${modelName} download has failed`,
            data: { downloadId, type: 'download_failed' },
          },
          trigger: null, // Show immediately
        });

        this.notificationIds[downloadId] = notificationId;
        await this.saveNotificationIds();

        // Remove notification ID after a delay
        setTimeout(async () => {
          delete this.notificationIds[downloadId];
          await this.saveNotificationIds();
        }, 5000);
      }
      
      // Always store for history, even if notification fails
      await this.storeNotification(
        'Download Failed',
        `${modelName} download has failed`,
        'download_failed',
        downloadId
      );
    } catch (error) {
      console.error('Error showing download failed notification:', error);
      // Still store the notification in history
      await this.storeNotification(
        'Download Failed',
        `${modelName} download has failed`,
        'download_failed',
        downloadId
      );
    }
  }

  async showDownloadPausedNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();

    try {
      // Only attempt to show notification if we're initialized
      if (this.isInitialized) {
        // Cancel previous notification for this download
        if (this.notificationIds[downloadId]) {
          try {
            await Notifications.cancelScheduledNotificationAsync(this.notificationIds[downloadId]);
          } catch (error) {
            console.warn('Error cancelling previous notification:', error);
          }
        }

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Download Paused',
            body: `${modelName} download has been paused`,
            data: { downloadId, type: 'download_paused' },
          },
          trigger: null, // Show immediately
        });

        this.notificationIds[downloadId] = notificationId;
        await this.saveNotificationIds();
      }
      
      // Always store for history, even if notification fails
      await this.storeNotification(
        'Download Paused',
        `${modelName} download has been paused`,
        'download_paused',
        downloadId
      );
    } catch (error) {
      console.error('Error showing download paused notification:', error);
      // Still store the notification in history
      await this.storeNotification(
        'Download Paused',
        `${modelName} download has been paused`,
        'download_paused',
        downloadId
      );
    }
  }

  async showDownloadResumedNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();

    try {
      // Only attempt to show notification if we're initialized
      if (this.isInitialized) {
        // Cancel previous notification for this download
        if (this.notificationIds[downloadId]) {
          try {
            await Notifications.cancelScheduledNotificationAsync(this.notificationIds[downloadId]);
          } catch (error) {
            console.warn('Error cancelling previous notification:', error);
          }
        }

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Download Resumed',
            body: `${modelName} download has been resumed`,
            data: { downloadId, type: 'download_resumed' },
          },
          trigger: null, // Show immediately
        });

        this.notificationIds[downloadId] = notificationId;
        await this.saveNotificationIds();
      }
      
      // Always store for history, even if notification fails
      await this.storeNotification(
        'Download Resumed',
        `${modelName} download has been resumed`,
        'download_resumed',
        downloadId
      );
    } catch (error) {
      console.error('Error showing download resumed notification:', error);
      // Still store the notification in history
      await this.storeNotification(
        'Download Resumed',
        `${modelName} download has been resumed`,
        'download_resumed',
        downloadId
      );
    }
  }

  async cancelDownloadNotification(downloadId: number): Promise<void> {
    if (this.notificationIds[downloadId]) {
      try {
        await Notifications.cancelScheduledNotificationAsync(this.notificationIds[downloadId]);
        delete this.notificationIds[downloadId];
        await this.saveNotificationIds();
      } catch (error) {
        console.error('Error cancelling notification:', error);
      }
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