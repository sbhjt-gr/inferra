import { NativeModules, Platform, PermissionsAndroid } from 'react-native';

interface DownloadNotificationModuleInterface {
  showDownloadNotification(modelName: string, downloadId: string, progress: number): Promise<boolean>;
  updateDownloadProgress(downloadId: string, progress: number): Promise<boolean>;
  cancelNotification(downloadId: string): Promise<boolean>;
}

const { DownloadNotificationModule } = NativeModules;

const mockImplementation: DownloadNotificationModuleInterface = {
  showDownloadNotification: async () => false,
  updateDownloadProgress: async () => false,
  cancelNotification: async () => false,
};

const nativeModule: DownloadNotificationModuleInterface = 
  Platform.OS === 'android' && DownloadNotificationModule 
    ? DownloadNotificationModule 
    : mockImplementation;

class DownloadNotificationService {
  private hasPermission: boolean = false;

  async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS !== 'android') return false;

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
      
      this.hasPermission = true;
      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  async showNotification(modelName: string, downloadId: string | number, progress: number): Promise<boolean> {
    try {
      if (Platform.OS !== 'android') return false;
      
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