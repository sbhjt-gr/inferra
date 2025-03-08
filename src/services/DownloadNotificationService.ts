import { NativeModules, Platform, PermissionsAndroid } from 'react-native';

// Define the interface for our native module
interface DownloadNotificationModuleInterface {
  showDownloadNotification(modelName: string, downloadId: string, progress: number): Promise<boolean>;
  updateDownloadProgress(downloadId: string, progress: number): Promise<boolean>;
  cancelNotification(downloadId: string): Promise<boolean>;
}

// Get the native module
const { DownloadNotificationModule } = NativeModules;

// Create a mock implementation for iOS or when the module is not available
const mockImplementation: DownloadNotificationModuleInterface = {
  showDownloadNotification: async () => false,
  updateDownloadProgress: async () => false,
  cancelNotification: async () => false,
};

// Use the native module if available, otherwise use the mock
const nativeModule: DownloadNotificationModuleInterface = 
  Platform.OS === 'android' && DownloadNotificationModule 
    ? DownloadNotificationModule 
    : mockImplementation;

class DownloadNotificationService {
  private hasPermission: boolean = false;

  /**
   * Request notification permissions
   * @returns Promise<boolean> - Whether permission was granted
   */
  async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS !== 'android') return false;

      // For Android 13+ (API level 33+), we need to request POST_NOTIFICATIONS permission
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          {
            title: "Notification Permission",
            message: "App needs notification permission to show download progress",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        
        this.hasPermission = granted === PermissionsAndroid.RESULTS.GRANTED;
        return this.hasPermission;
      }
      
      // For older Android versions, permission is granted by default
      this.hasPermission = true;
      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  /**
   * Show a download notification with progress
   * @param modelName The name of the model being downloaded
   * @param downloadId The unique ID of the download
   * @param progress The download progress (0-100)
   */
  async showNotification(modelName: string, downloadId: string | number, progress: number): Promise<boolean> {
    try {
      if (Platform.OS !== 'android') return false;
      
      // Request permissions if we don't have them yet
      if (!this.hasPermission) {
        await this.requestPermissions();
      }
      
      return await nativeModule.showDownloadNotification(
        modelName, 
        downloadId.toString(), 
        Math.round(progress)
      );
    } catch (error) {
      console.error('Error showing download notification:', error);
      return false;
    }
  }

  /**
   * Update the progress of an existing download notification
   * @param downloadId The unique ID of the download
   * @param progress The download progress (0-100)
   */
  async updateProgress(downloadId: string | number, progress: number): Promise<boolean> {
    try {
      if (Platform.OS !== 'android') return false;
      
      return await nativeModule.updateDownloadProgress(
        downloadId.toString(), 
        Math.round(progress)
      );
    } catch (error) {
      console.error('Error updating download progress:', error);
      return false;
    }
  }

  /**
   * Cancel a download notification
   * @param downloadId The unique ID of the download
   */
  async cancelNotification(downloadId: string | number): Promise<boolean> {
    try {
      if (Platform.OS !== 'android') return false;
      
      return await nativeModule.cancelNotification(downloadId.toString());
    } catch (error) {
      console.error('Error cancelling notification:', error);
      return false;
    }
  }
}

export const downloadNotificationService = new DownloadNotificationService(); 