import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EventEmitter from 'eventemitter3';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { notificationService } from './NotificationService';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

interface ActiveDownload {
  downloadId: number;
  filename: string;
  url: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: 'queued' | 'downloading' | 'completed' | 'failed';
  timestamp: number;
  options?: FileSystem.DownloadOptions;
}

export interface DownloadProgress {
  [key: string]: {
    progress: number;
    bytesDownloaded: number;
    totalBytes: number;
    status: string;
    downloadId: number;
    isProcessing?: boolean;
    error?: string;
  };
}

export interface ModelInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
}

export interface StoredModel {
  name: string;
  path: string;
  size: number;
  modified: string;
}

export interface DownloadStatus {
  status: string;
  bytesDownloaded?: number;
  totalBytes?: number;
  reason?: string;
}

class ModelDownloader extends EventEmitter {
  private readonly baseDir: string;
  private downloadResumables: Map<number, FileSystem.DownloadResumable> = new Map();
  private activeDownloads: Map<string, ActiveDownload> = new Map();
  private nextDownloadId: number = 1;
  private appState: AppStateStatus = AppState.currentState;
  private isInitialized: boolean = false;
  private hasNotificationPermission: boolean = false;
  private _notificationSubscription: Notifications.NotificationSubscription | null = null;
  private wasOpenedViaNotification: boolean = false;

  constructor() {
    super();
    this.baseDir = `${FileSystem.documentDirectory}models`;
    this.initialize();
  }

  private async initialize() {
    try {
      // Initialize directory
      await this.initializeDirectory();
      
      // Set up notifications
      await this.setupNotifications();
      
      // Load next download ID
      const savedId = await AsyncStorage.getItem('next_download_id');
      if (savedId) {
        this.nextDownloadId = parseInt(savedId, 10);
      }

      // Load active downloads
      await this.loadActiveDownloads();

      // Set up app state listener
      AppState.addEventListener('change', this.handleAppStateChange);

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize ModelDownloader:', error);
    }
  }

  private async setupNotifications() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('downloads', {
        name: 'Downloads',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldHandleInForeground: false,
      }),
    });

    // Set up notification response handler
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      // Set the flag when notification is clicked
      this.wasOpenedViaNotification = true;
    });

    this._notificationSubscription = subscription;
  }

  private async requestNotificationPermissions(): Promise<boolean> {
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      this.hasNotificationPermission = finalStatus === 'granted';
      return this.hasNotificationPermission;
    }
    
    return false;
  }

  private async initializeDirectory() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
      }
    } catch (error) {
      console.error('Failed to initialize directory:', error);
      throw error;
    }
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus) => {
    try {
      await this.persistActiveDownloads();
      this.appState = nextAppState;
    } catch (error) {
      console.error('Error handling app state change:', error);
    }
  };

  private async persistActiveDownloads() {
    try {
      const downloads: Record<string, ActiveDownload> = {};
      
      for (const [filename, download] of this.activeDownloads.entries()) {
        const downloadResumable = this.downloadResumables.get(download.downloadId);
        if (downloadResumable) {
          try {
            // Only try to get resumable data on iOS
            let resumeData = undefined;
            if (Platform.OS === 'ios') {
              resumeData = await downloadResumable.savable();
            }
            
            downloads[filename] = {
              ...download,
              resumeData,
              options: downloadResumable.options,
              timestamp: Date.now()
            };
          } catch (error) {
            console.error(`Failed to save resumable for ${filename}:`, error);
            downloads[filename] = {
              ...download,
              timestamp: Date.now()
            };
          }
        }
      }

      await AsyncStorage.setItem('active_downloads', JSON.stringify(downloads));
      await AsyncStorage.setItem('next_download_id', this.nextDownloadId.toString());
    } catch (error) {
      console.error('Failed to persist active downloads:', error);
    }
  }

  private async loadActiveDownloads() {
    try {
      const savedDownloads = await AsyncStorage.getItem('active_downloads');
      if (!savedDownloads) return;

      const downloads = JSON.parse(savedDownloads) as Record<string, ActiveDownload>;
      this.activeDownloads.clear();
      this.downloadResumables.clear();

      for (const [filename, download] of Object.entries(downloads)) {
        if (download.status === 'completed' || download.status === 'failed') continue;

        try {
          // Create download options
          const downloadOptions: FileSystem.DownloadOptions = {
            cache: false,
            // @ts-ignore
            requiresNetworkSession: true,
            // @ts-ignore
            allowsBackgroundSessionDownloads: true
          };

          // Create new download resumable
            const downloadResumable = FileSystem.createDownloadResumable(
            download.url,
              `${this.baseDir}/${filename}`,
            downloadOptions,
            this.createProgressCallback(download.downloadId, filename)
          );

          // Store the download info
          const restoredDownload = {
            ...download,
            status: 'downloading'
          };
                  
          this.activeDownloads.set(filename, restoredDownload);
          this.downloadResumables.set(download.downloadId, downloadResumable);

          // Start the download immediately
          downloadResumable.downloadAsync().catch(error => {
            console.error(`Failed to start download for ${filename}:`, error);
          });

          // Emit current state
            this.emit('downloadProgress', { 
              modelName: filename, 
            progress: restoredDownload.progress,
            bytesDownloaded: restoredDownload.bytesDownloaded,
            totalBytes: restoredDownload.totalBytes,
            status: 'downloading',
            downloadId: restoredDownload.downloadId
          });
          } catch (error) {
          console.error(`Failed to restore download for ${filename}:`, error);
          continue;
        }
      }
    } catch (error) {
      console.error('Failed to load active downloads:', error);
    }
  }

  private createProgressCallback(downloadId: number, filename: string) {
    let lastNotificationTime = 0;
    const NOTIFICATION_THROTTLE = 1000; // Update notification every second

    return async (downloadProgress: FileSystem.DownloadProgressData) => {
      if (!downloadProgress.totalBytesWritten || !downloadProgress.totalBytesExpectedToWrite) return;

      const progress = Math.round((downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100);
      
      // Update active download
      const download = this.activeDownloads.get(filename);
      if (download) {
        download.progress = progress;
        download.bytesDownloaded = downloadProgress.totalBytesWritten;
        download.totalBytes = downloadProgress.totalBytesExpectedToWrite;
        download.timestamp = Date.now();
        
        // Don't change status here - maintain the current status
        const currentStatus = download.status;
        
        // Persist progress
        await this.persistActiveDownloads();

        // Emit progress with current status
        this.emit('downloadProgress', {
          modelName: filename,
          progress,
          bytesDownloaded: downloadProgress.totalBytesWritten,
          totalBytes: downloadProgress.totalBytesExpectedToWrite,
          status: currentStatus,
          downloadId
        });

        // Update notification with throttling
        const now = Date.now();
        if (this.hasNotificationPermission && (now - lastNotificationTime > NOTIFICATION_THROTTLE)) {
          lastNotificationTime = now;
          
          const formattedSize = (downloadProgress.totalBytesExpectedToWrite / (1024 * 1024)).toFixed(1);
          const formattedProgress = (downloadProgress.totalBytesWritten / (1024 * 1024)).toFixed(1);
          
          // Update the existing notification with progress
          await Notifications.scheduleNotificationAsync({
            identifier: `download_${downloadId}`,
            content: {
              title: `Downloading ${filename}`,
              body: `${formattedProgress}MB / ${formattedSize}MB`,
              data: { downloadId, type: 'download_progress' },
              // Common notification properties
              sound: null,
              priority: Notifications.AndroidNotificationPriority.HIGH,
              // Android specific properties
              android: {
                channelId: 'downloads',
                // Show progress bar
                progress: progress,
                maxProgress: 100,
                ongoing: true,
                autoCancel: false,
                showWhen: true,
                // Make it a foreground notification
                sticky: true,
                priority: Notifications.AndroidImportance.HIGH,
                // Prevent notification from being cancelled when clicked
                onlyAlertOnce: true,
                indeterminate: false,
                // Show progress in the notification
                showProgress: true,
                // Use small icon for notification
                smallIcon: 'ic_notification',
                // Color the progress bar
                color: '#4a0660'
              },
              // iOS specific properties
              ios: {
                sound: null,
                // Show progress in the notification (iOS 15+)
                progress: progress / 100
              }
            },
            trigger: null,
          });
        }
      }
    };
  }

  async downloadModel(url: string, filename: string): Promise<{ downloadId: number; path: string }> {
    if (!this.isInitialized) {
      throw new Error('ModelDownloader not initialized');
    }

    // Request notification permissions before starting download
    await this.requestNotificationPermissions();

    const downloadId = this.nextDownloadId++;
    
    // Create download options
    const downloadOptions: FileSystem.DownloadOptions = {
      cache: false,
      // @ts-ignore
      requiresNetworkSession: true,
      // @ts-ignore
      allowsBackgroundSessionDownloads: true
    };

    // Create download resumable
    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      `${this.baseDir}/${filename}`,
      downloadOptions,
      this.createProgressCallback(downloadId, filename)
    );

    // Store download info
    const download: ActiveDownload = {
      downloadId,
      filename,
      url,
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      status: 'queued',
      timestamp: Date.now(),
      options: downloadOptions
    };

    this.activeDownloads.set(filename, download);
    this.downloadResumables.set(downloadId, downloadResumable);

    // Persist state
    await this.persistActiveDownloads();

    try {
      // Show initial notification if we have permission
      if (this.hasNotificationPermission) {
        await Notifications.scheduleNotificationAsync({
          identifier: `download_${downloadId}`,
          content: {
            title: `Downloading ${filename}`,
            body: 'Starting download...',
            data: { downloadId, type: 'download_start' },
            // Common notification properties
            sound: null,
            priority: Notifications.AndroidNotificationPriority.HIGH,
            // Android specific properties
            android: {
              channelId: 'downloads',
              // Show indeterminate progress initially
        progress: 0,
              maxProgress: 100,
              ongoing: true,
              autoCancel: false,
              showWhen: true,
              // Make it a foreground notification
              sticky: true,
              priority: Notifications.AndroidImportance.HIGH,
              // Show progress in the notification
              showProgress: true,
              // Use small icon for notification
              smallIcon: 'ic_notification',
              // Color the progress bar
              color: '#4a0660',
              // Show indeterminate progress initially
              indeterminate: true
            },
            // iOS specific properties
            ios: {
              sound: null,
              // Show initial progress
              progress: 0
            }
          },
          trigger: null,
        });
      }
      
      // Start download
      download.status = 'downloading';
      await this.persistActiveDownloads();

      const result = await downloadResumable.downloadAsync();
      if (result) {
        // Update status
        download.status = 'completed';
        download.progress = 100;
        download.bytesDownloaded = result.totalBytesWritten || 0;
        download.totalBytes = result.totalBytesWritten || 0;
        
        // Persist final state
        await this.persistActiveDownloads();

        // Show completion notification if we have permission
        if (this.hasNotificationPermission) {
          await Notifications.scheduleNotificationAsync({
            identifier: `download_${downloadId}`,
            content: {
              title: `Download Complete`,
              body: `${filename} has been downloaded successfully`,
              data: { downloadId, type: 'download_complete' },
              // Common notification properties
              sound: null,
              // Android specific properties
              android: {
                channelId: 'downloads',
                // Show completed progress
          progress: 100,
                maxProgress: 100,
                ongoing: false,
                autoCancel: true,
                showWhen: true,
                // Show progress in the notification
                showProgress: true,
                // Use small icon for notification
                smallIcon: 'ic_notification',
                // Color the progress bar
                color: '#4a0660'
              },
              // iOS specific properties
              ios: {
                sound: null,
                // Show completed progress
                progress: 1
              }
            },
            trigger: null,
          });
        }
        
        // Clean up
        this.activeDownloads.delete(filename);
        this.downloadResumables.delete(downloadId);
        await this.persistActiveDownloads();
      }
    } catch (error) {
      console.error('Download error:', error);
      
      // Update status
      download.status = 'failed';
      await this.persistActiveDownloads();

      // Show failure notification if we have permission
      if (this.hasNotificationPermission) {
        await Notifications.scheduleNotificationAsync({
          identifier: `download_${downloadId}`,
          content: {
            title: `Download Failed`,
            body: `Failed to download ${filename}`,
            data: { downloadId, type: 'download_failed' },
            // Common notification properties
            sound: null,
            // Android specific properties
            android: {
              channelId: 'downloads',
              ongoing: false,
              autoCancel: true,
              // Use small icon for notification
              smallIcon: 'ic_notification',
              // Color for the notification
              color: '#ff4444'
            }
          },
          trigger: null,
        });
      }
      
      // Clean up
      this.activeDownloads.delete(filename);
      this.downloadResumables.delete(downloadId);
      await this.persistActiveDownloads();

      throw error;
    }

    return {
      downloadId,
      path: `${this.baseDir}/${filename}`
    };
  }

  async cancelDownload(downloadId: number): Promise<void> {
    const downloadResumable = this.downloadResumables.get(downloadId);
    if (!downloadResumable) {
      throw new Error('Download not found');
    }

    const filename = Array.from(this.activeDownloads.entries())
      .find(([_, download]) => download.downloadId === downloadId)?.[0];
    
    if (!filename) {
      throw new Error('Download not found');
    }

    try {
      await downloadResumable.pauseAsync();
      
      // Delete partial file
      const filePath = `${this.baseDir}/${filename}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }

      // Clean up
      this.activeDownloads.delete(filename);
      this.downloadResumables.delete(downloadId);
      await this.persistActiveDownloads();

      // Cancel notification
      await notificationService.cancelDownloadNotification(downloadId);
    } catch (error) {
      console.error('Error canceling download:', error);
      throw error;
    }
  }

  async getStoredModels(): Promise<StoredModel[]> {
    try {
      const files = await FileSystem.readDirectoryAsync(this.baseDir);
      const models = await Promise.all(
        files.map(async (filename) => {
          const path = `${this.baseDir}/${filename}`;
          const info = await FileSystem.getInfoAsync(path);
          return {
            name: filename,
            path,
            size: info.size || 0,
            modified: new Date().toISOString()
          };
        })
      );
      return models;
    } catch (error) {
      console.error('Error getting stored models:', error);
      return [];
    }
  }

  async deleteModel(path: string): Promise<boolean> {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        await FileSystem.deleteAsync(path);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting model:', error);
      return false;
    }
  }

  async checkBackgroundDownloads(): Promise<void> {
    try {
      // Load active downloads from storage
      const savedDownloads = await AsyncStorage.getItem('active_downloads');
      if (!savedDownloads) return;

      const downloads = JSON.parse(savedDownloads) as Record<string, ActiveDownload>;
      
      // Check each download
      for (const [filename, download] of Object.entries(downloads)) {
        if (download.status !== 'downloading') continue;

        try {
          // Check file status
          const filePath = `${this.baseDir}/${filename}`;
          const fileInfo = await FileSystem.getInfoAsync(filePath);
          
          if (fileInfo.exists) {
            // Update notification if we have permission
            if (this.hasNotificationPermission) {
              const formattedSize = (download.totalBytes / (1024 * 1024)).toFixed(1);
              const formattedProgress = (download.bytesDownloaded / (1024 * 1024)).toFixed(1);
              
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `Downloading ${filename}`,
                  body: `${download.progress}% complete (${formattedProgress}MB / ${formattedSize}MB)`,
                  data: { downloadId: download.downloadId, type: 'download_progress' },
                },
                trigger: null,
              });
            }

            // Emit progress event
          this.emit('downloadProgress', { 
            modelName: filename, 
              progress: download.progress,
              bytesDownloaded: download.bytesDownloaded,
              totalBytes: download.totalBytes,
              status: download.status,
              downloadId: download.downloadId
            });
          }
        } catch (error) {
          console.error(`Error checking download status for ${filename}:`, error);
        }
      }
    } catch (error) {
      console.error('Error checking background downloads:', error);
      throw error;
    }
  }

  cleanup() {
    AppState.removeEventListener('change', this.handleAppStateChange);
    if (this._notificationSubscription) {
      this._notificationSubscription.remove();
    }
  }
}

export const modelDownloader = new ModelDownloader(); 