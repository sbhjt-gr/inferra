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
  private lastNotifiedProgress: Record<number, number> = {};
  private lastKnownTotals: Record<number, { bytes: number; total: number }> = {};

  constructor() {
    this.initialize();
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      
      const savedIds = await AsyncStorage.getItem('downloadNotificationIds');
      if (savedIds) {
        this.notificationIds = JSON.parse(savedIds);
      }

      this.isInitialized = true;
    } catch (error) {
      
      this.isInitialized = true;
    }
  }

  private async storeNotification(title: string, description: string, type: string, downloadId?: number) {
    try {
      
      const existingNotificationsJson = await AsyncStorage.getItem('downloadNotifications');
      let notifications: StoredNotification[] = [];
      
      if (existingNotificationsJson) {
        notifications = JSON.parse(existingNotificationsJson);
      }
      
      
      const newNotification: StoredNotification = {
        id: Date.now().toString(),
        title,
        description,
        timestamp: Date.now(),
        type,
        downloadId
      };
      
      
      notifications.unshift(newNotification);
      
      
      if (notifications.length > 50) {
        notifications = notifications.slice(0, 50);
      }
      
      
      await AsyncStorage.setItem('downloadNotifications', JSON.stringify(notifications));
    } catch (error) {
    }
  }

  private getNotificationIdentifier(downloadId: number, nativeDownloadId?: string): string {
    return nativeDownloadId ?? downloadId.toString();
  }

  private shouldSendNativeNotification(nativeDownloadId?: string): boolean {
    if (Platform.OS === 'android') {
      return !!nativeDownloadId;
    }
    return true;
  }

  async showDownloadStartedNotification(modelName: string, downloadId: number, nativeDownloadId?: string): Promise<void> {
    await this.initialize();
    
    const identifier = this.getNotificationIdentifier(downloadId, nativeDownloadId);

    if (this.shouldSendNativeNotification(nativeDownloadId)) {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        await downloadNotificationService.showNotification(modelName, identifier, 0);
      }
    }
    
    this.lastNotifiedProgress[downloadId] = 0;
    
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
    totalBytes: number,
    nativeDownloadId?: string,
  ): Promise<void> {
    await this.initialize();

    const lastProgress = this.lastNotifiedProgress[downloadId] ?? -1;
    if (progress < lastProgress + 5 && progress < 100) {
      return;
    }
    this.lastNotifiedProgress[downloadId] = progress;
    this.lastKnownTotals[downloadId] = {
      bytes: bytesDownloaded,
      total: totalBytes,
    };

    const identifier = this.getNotificationIdentifier(downloadId, nativeDownloadId);

    if (this.shouldSendNativeNotification(nativeDownloadId)) {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        await downloadNotificationService.updateProgress(
          identifier,
          progress,
          bytesDownloaded,
          totalBytes,
          modelName
        );
      }
    }
    
    
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

  async showDownloadCompletedNotification(modelName: string, downloadId: number, nativeDownloadId?: string): Promise<void> {
    await this.initialize();

    this.lastNotifiedProgress[downloadId] = 100;

    const identifier = this.getNotificationIdentifier(downloadId, nativeDownloadId);

    if (this.shouldSendNativeNotification(nativeDownloadId)) {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        await downloadNotificationService.showNotification(modelName, identifier, 100);
      }
    }
    
    delete this.lastNotifiedProgress[downloadId];
    delete this.lastKnownTotals[downloadId];
    
    await this.storeNotification(
      'Download Complete',
      `${modelName} has been downloaded successfully`,
      'download_completed',
      downloadId
    );
  }

  async showDownloadFailedNotification(modelName: string, downloadId: number, nativeDownloadId?: string): Promise<void> {
    await this.initialize();

    const identifier = this.getNotificationIdentifier(downloadId, nativeDownloadId);

    if (this.shouldSendNativeNotification(nativeDownloadId)) {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        await downloadNotificationService.cancelNotification(identifier);
      }
    }
    
    delete this.lastNotifiedProgress[downloadId];
    delete this.lastKnownTotals[downloadId];
    
    await this.storeNotification(
      'Download Failed',
      `${modelName} download has failed`,
      'download_failed',
      downloadId
    );
  }

  async showDownloadPausedNotification(
    modelName: string,
    downloadId: number,
    nativeDownloadId?: string,
    bytesDownloaded: number = 0,
    totalBytes: number = 0,
    progress: number = 0,
  ): Promise<void> {
    await this.initialize();

    const identifier = this.getNotificationIdentifier(downloadId, nativeDownloadId);
    this.lastNotifiedProgress[downloadId] = progress;
    this.lastKnownTotals[downloadId] = {
      bytes: bytesDownloaded,
      total: totalBytes,
    };

    if (this.shouldSendNativeNotification(nativeDownloadId)) {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        await downloadNotificationService.markPaused(
          identifier,
          modelName,
          bytesDownloaded,
          totalBytes,
        );
      }
    }

    await this.storeNotification(
      'Download Paused',
      `${modelName} download has been paused`,
      'download_paused',
      downloadId
    );
  }

  async showDownloadPauseUnavailableNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();
    
    
    await this.storeNotification(
      'Pause Not Available',
      `Pausing ${modelName} download is not supported`,
      'download_pause_unavailable',
      downloadId
    );
  }

  async showDownloadResumedNotification(
    modelName: string,
    downloadId: number,
    nativeDownloadId?: string,
  ): Promise<void> {
    await this.initialize();

    const identifier = this.getNotificationIdentifier(downloadId, nativeDownloadId);
    const progress = this.lastNotifiedProgress[downloadId] ?? 0;
    const totals = this.lastKnownTotals[downloadId] ?? { bytes: 0, total: 0 };

    if (this.shouldSendNativeNotification(nativeDownloadId)) {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        await downloadNotificationService.updateProgress(
          identifier,
          progress,
          totals.bytes,
          totals.total,
          modelName,
        );
      }
    }

    await this.storeNotification(
      'Download Resumed',
      `${modelName} download has been resumed`,
      'download_resumed',
      downloadId
    );
  }

  async showDownloadResumeUnavailableNotification(modelName: string, downloadId: number): Promise<void> {
    await this.initialize();
    
    
    await this.storeNotification(
      'Resume Not Available',
      `Resuming ${modelName} download is not supported`,
      'download_resume_unavailable',
      downloadId
    );
  }

  async showDownloadCancelledNotification(modelName: string, downloadId: number, nativeDownloadId?: string): Promise<void> {
    await this.initialize();

    const identifier = this.getNotificationIdentifier(downloadId, nativeDownloadId);

    if (this.shouldSendNativeNotification(nativeDownloadId)) {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        await downloadNotificationService.cancelNotification(identifier);
      }
    }
    
    delete this.lastNotifiedProgress[downloadId];
    delete this.lastKnownTotals[downloadId];
    
    await this.storeNotification(
      'Download Cancelled',
      `${modelName} download has been cancelled`,
      'download_cancelled',
      downloadId
    );
  }

  async showGenericNotification(title: string, body: string, modelName: string, downloadId: number): Promise<void> {
    await this.initialize();
    
    
    await this.storeNotification(
      title,
      body,
      'generic',
      downloadId
    );
  }

  async cancelDownloadNotification(downloadId: number, nativeDownloadId?: string): Promise<void> {
    const identifier = this.getNotificationIdentifier(downloadId, nativeDownloadId);

    if (this.shouldSendNativeNotification(nativeDownloadId)) {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        await downloadNotificationService.cancelNotification(identifier);
      }
    }
    delete this.lastNotifiedProgress[downloadId];
    delete this.lastKnownTotals[downloadId];
  }

  private async saveNotificationIds(): Promise<void> {
    try {
      await AsyncStorage.setItem('downloadNotificationIds', JSON.stringify(this.notificationIds));
    } catch (error) {
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
