import RNBackgroundDownloader from '@kesha-antonov/react-native-background-downloader';
import { EventEmitter } from 'events';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState, AppStateStatus } from 'react-native';
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
  destination?: string;
  options?: FileSystem.DownloadOptions;
}

interface DownloadTaskInfo {
  task: RNBackgroundDownloader.DownloadTask;
  downloadId: number;
  modelName: string;
  progress?: number;
  bytesDownloaded?: number;
  totalBytes?: number;
  destination?: string;
  url?: string;
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
    isPaused?: boolean;
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
  private readonly downloadDir: string;
  private activeDownloads: Map<string, DownloadTaskInfo> = new Map();
  private nextDownloadId = 1;
  private appState: AppStateStatus = AppState.currentState;
  private isInitialized: boolean = false;
  private hasNotificationPermission: boolean = false;
  private _notificationSubscription: any = null;
  private wasOpenedViaNotification: boolean = false;

  constructor() {
    super();
    this.baseDir = `${FileSystem.documentDirectory}models`;
    this.downloadDir = `${FileSystem.documentDirectory}temp`;  // Use a temp directory for downloads
    this.initialize();
  }

  private async initialize() {
    try {
      // Initialize directories
      await this.initializeDirectory();
      
      // Set up notifications
      await this.setupNotifications();
      
      // Load next download ID
      const savedId = await AsyncStorage.getItem('next_download_id');
      if (savedId) {
        this.nextDownloadId = parseInt(savedId, 10);
      }

      // Load active downloads
      await this.checkForExistingDownloads();

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
      // Create base directory if it doesn't exist
      const baseDirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!baseDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
      }

      // Create temp directory if it doesn't exist
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.downloadDir, { intermediates: true });
      }

      console.log('Directories initialized:', {
        baseDir: this.baseDir,
        downloadDir: this.downloadDir
      });
    } catch (error) {
      console.error('Failed to initialize directory:', error);
      throw error;
    }
  }

  private async checkForExistingDownloads() {
    try {
      console.log('Checking for existing downloads...');
      
      // First, load saved downloads from storage
      const savedDownloadsJson = await AsyncStorage.getItem('active_downloads');
      const savedDownloads = savedDownloadsJson ? JSON.parse(savedDownloadsJson) : {};
      
      // Then check for existing background downloads
      const tasks = await RNBackgroundDownloader.checkForExistingDownloads();
      console.log(`Found ${tasks.length} existing background downloads`);

      // Map of model names to their tasks
      const taskMap = new Map(tasks.map(task => [task.id, task]));

      // Process all saved downloads
      for (const [modelName, savedInfo] of Object.entries(savedDownloads)) {
        const downloadInfo = savedInfo as ActiveDownload;
        const existingTask = taskMap.get(modelName);

        if (existingTask) {
          // Download exists in background downloader, reattach to it
          console.log(`Reattaching to existing download: ${modelName}`);
          this.activeDownloads.set(modelName, {
            task: existingTask,
            downloadId: downloadInfo.downloadId,
            modelName,
            progress: downloadInfo.progress,
            bytesDownloaded: downloadInfo.bytesDownloaded,
            totalBytes: downloadInfo.totalBytes,
            destination: downloadInfo.destination,
            url: downloadInfo.url
          });
          
          this.attachDownloadHandlers(existingTask);
        } else {
          // Download was saved but not in background downloader, try to resume
          console.log(`Attempting to resume interrupted download: ${modelName}`);
          try {
            const task = RNBackgroundDownloader.download({
              id: modelName,
              url: downloadInfo.url,
              destination: downloadInfo.destination || `${this.downloadDir}/${modelName}`,
              resumable: true,
              headers: {
                'Accept-Ranges': 'bytes',
                'Range': `bytes=${downloadInfo.bytesDownloaded}-`
              }
            });

            this.activeDownloads.set(modelName, {
              task,
              downloadId: downloadInfo.downloadId,
              modelName,
              progress: downloadInfo.progress,
              bytesDownloaded: downloadInfo.bytesDownloaded,
              totalBytes: downloadInfo.totalBytes,
              destination: downloadInfo.destination,
              url: downloadInfo.url
            });

            this.attachDownloadHandlers(task);
          } catch (error) {
            console.error(`Failed to resume download for ${modelName}:`, error);
          }
        }

        // Emit initial progress to update UI
        this.emit('downloadProgress', {
          modelName,
          progress: downloadInfo.progress,
          bytesDownloaded: downloadInfo.bytesDownloaded,
          totalBytes: downloadInfo.totalBytes,
          status: 'downloading',
          downloadId: downloadInfo.downloadId
        });
      }

      // Check for completed downloads
      await this.checkBackgroundDownloads();
    } catch (error) {
      console.error('Error checking existing downloads:', error);
    }
  }

  // Add a method to ensure downloads are running
  async ensureDownloadsAreRunning() {
    try {
      console.log('Ensuring downloads are running...');
      await RNBackgroundDownloader.ensureDownloadsAreRunning();
      console.log('Downloads should now be running');
    } catch (error) {
      console.error('Error ensuring downloads are running:', error);
    }
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus) => {
    console.log('App state changed:', { previous: this.appState, next: nextAppState });
    
    // When app comes to foreground
    if (nextAppState === 'active' && (this.appState === 'background' || this.appState === 'inactive')) {
      console.log('App came to foreground, checking for background downloads...');
      
      // First check if any downloads completed in the background
      await this.checkBackgroundDownloads();
      
      // Then verify the status of any remaining active downloads
      for (const [modelName, downloadInfo] of this.activeDownloads.entries()) {
        try {
          // Check if the file exists in the models directory
          const modelPath = `${this.baseDir}/${modelName}`;
          const fileInfo = await FileSystem.getInfoAsync(modelPath);
          
          if (fileInfo.exists) {
            // If the file exists in models directory, it means download is complete
            console.log(`Found completed model: ${modelName}`);
            const fileSize = await this.getFileSize(modelPath);
            
            // Emit completion event
            this.emit('downloadProgress', {
              modelName,
              progress: 100,
              bytesDownloaded: fileSize,
              totalBytes: fileSize,
              status: 'completed',
              downloadId: downloadInfo.downloadId
            });
            
            // Remove from active downloads
            this.activeDownloads.delete(modelName);
          } else {
            // Check temp directory
            const tempPath = downloadInfo.destination;
            if (tempPath) {
              const tempInfo = await FileSystem.getInfoAsync(tempPath);
              if (tempInfo.exists) {
                // If file exists in temp, try to move it to models directory
                try {
                  await this.moveFile(tempPath, modelPath);
                  const finalSize = await this.getFileSize(modelPath);
                  
                  // Emit completion event
            this.emit('downloadProgress', { 
                    modelName,
                    progress: 100,
                    bytesDownloaded: finalSize,
                    totalBytes: finalSize,
                    status: 'completed',
                    downloadId: downloadInfo.downloadId
                  });
                  
                  this.activeDownloads.delete(modelName);
                } catch (moveError) {
                  console.error(`Error moving completed file for ${modelName}:`, moveError);
                }
          }
        }
      }
    } catch (error) {
          console.error(`Error checking status for ${modelName}:`, error);
        }
      }
      
      await this.ensureDownloadsAreRunning();
    }
    
    // When app goes to background
    if (nextAppState === 'background' && this.appState === 'active') {
      console.log('App went to background, persisting active downloads...');
      await this.persistActiveDownloads();
    }
    
    this.appState = nextAppState;
  };

  private async persistActiveDownloads() {
    try {
      const downloads: Record<string, ActiveDownload> = {};
      
      for (const [filename, downloadInfo] of this.activeDownloads.entries()) {
        downloads[filename] = {
          downloadId: downloadInfo.downloadId,
          filename,
          url: downloadInfo.url || '',
          progress: downloadInfo.progress || 0,
          bytesDownloaded: downloadInfo.bytesDownloaded || 0,
          totalBytes: downloadInfo.totalBytes || 0,
          status: 'downloading',
          timestamp: Date.now(),
          destination: downloadInfo.destination
        };
      }

      await AsyncStorage.setItem('active_downloads', JSON.stringify(downloads));
      await AsyncStorage.setItem('next_download_id', this.nextDownloadId.toString());
    } catch (error) {
      console.error('Failed to persist active downloads:', error);
    }
  }

  private async showNotification(title: string, body: string, data?: any) {
    if (!this.hasNotificationPermission) {
      return;
    }

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH
        },
        trigger: null
      });
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  private attachDownloadHandlers(task: RNBackgroundDownloader.DownloadTask) {
    // Store expected total bytes from begin event
    let expectedTotalBytes = 0;
    const downloadInfo = this.activeDownloads.get(task.id);

    if (!downloadInfo) {
      console.error('No download info found for task:', task.id);
      return;
    }

    task.begin(({ expectedBytes }: { expectedBytes: number }) => {
      console.log('Download began:', {
        modelName: task.id,
        expectedBytes,
        downloadId: downloadInfo.downloadId,
        destination: downloadInfo.destination
      });
      expectedTotalBytes = expectedBytes;

      // Update stored info with expected bytes
      downloadInfo.totalBytes = expectedBytes;
      this.activeDownloads.set(task.id, downloadInfo);
    })
    .progress((data: any) => {
      try {
        // Extract values safely using the correct property names
        let bytesDownloaded = 0;
        let totalBytes = expectedTotalBytes;

        if (typeof data === 'object') {
          if ('bytesDownloaded' in data) {
            bytesDownloaded = Number(data.bytesDownloaded);
          } else if ('bytesWritten' in data) {
            bytesDownloaded = Number(data.bytesWritten);
          }

          if ('bytesTotal' in data) {
            totalBytes = Number(data.bytesTotal);
          } else if ('totalBytes' in data) {
            totalBytes = Number(data.totalBytes);
          }
        }

        // Update stored info
        downloadInfo.bytesDownloaded = bytesDownloaded;
        downloadInfo.totalBytes = totalBytes;
        downloadInfo.progress = Math.min(100, Math.floor((bytesDownloaded / Math.max(1, totalBytes)) * 100));
        this.activeDownloads.set(task.id, downloadInfo);

        // Emit progress
        this.emit('downloadProgress', {
          modelName: task.id,
          progress: downloadInfo.progress,
          bytesDownloaded,
          totalBytes,
          status: 'downloading',
          downloadId: downloadInfo.downloadId
        });
      } catch (error) {
        console.error('Error in progress handler:', error);
        this.emit('downloadProgress', {
          modelName: task.id,
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: expectedTotalBytes || 1,
          status: 'downloading',
          downloadId: downloadInfo.downloadId
        });
      }
    })
    .done(async () => {
      try {
        const downloadInfo = this.activeDownloads.get(task.id);
        if (!downloadInfo) {
          throw new Error('No download info found');
        }

        const sourcePath = downloadInfo.destination;
        const destPath = `${this.baseDir}/${task.id}`;

        if (!sourcePath) {
          throw new Error('Source path is undefined');
        }

        console.log('Moving downloaded file:', {
          from: sourcePath,
          to: destPath
        });

        await this.moveFile(sourcePath, destPath);
        const finalSize = await this.getFileSize(destPath);

        console.log('Download completed successfully:', {
          modelName: task.id,
          size: finalSize,
          destination: destPath
        });

        // Show completion notification
        await this.showNotification(
          'Download Complete',
          `${task.id} has been downloaded successfully.`,
          { modelName: task.id, action: 'download_complete' }
        );

        this.emit('downloadProgress', {
          modelName: task.id,
          progress: 100,
          bytesDownloaded: finalSize,
          totalBytes: finalSize,
          status: 'completed',
          downloadId: downloadInfo.downloadId
        });

        this.activeDownloads.delete(task.id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to move downloaded file';
        console.error('Error in done handler:', error);
        
        const downloadInfo = this.activeDownloads.get(task.id);
        if (downloadInfo) {
          // Show error notification
          await this.showNotification(
            'Download Failed',
            `${task.id} download failed: ${errorMessage}`,
            { modelName: task.id, action: 'download_failed' }
          );

          this.emit('downloadProgress', {
            modelName: task.id,
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            status: 'failed',
            downloadId: downloadInfo.downloadId,
            error: errorMessage
          });
        }
        
        this.activeDownloads.delete(task.id);
      }
    })
    .error(async (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      console.error('Download error:', error);

      // Show error notification
      await this.showNotification(
        'Download Failed',
        `${task.id} download failed: ${errorMessage}`,
        { modelName: task.id, action: 'download_failed' }
      );
      
      this.emit('downloadProgress', {
        modelName: task.id,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'failed',
        downloadId: downloadInfo.downloadId,
        error: errorMessage
      });
      this.activeDownloads.delete(task.id);
    });
  }

  private async moveFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      // Check if source exists
      const sourceInfo = await FileSystem.getInfoAsync(sourcePath);
      if (!sourceInfo.exists) {
        throw new Error(`Source file not found: ${sourcePath}`);
      }

      // Ensure destination directory exists
      const destDir = destPath.substring(0, destPath.lastIndexOf('/'));
      const destDirInfo = await FileSystem.getInfoAsync(destDir);
      if (!destDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      }

      // Move the file
      await FileSystem.moveAsync({
        from: sourcePath,
        to: destPath
      });

      // Verify move was successful
      const destInfo = await FileSystem.getInfoAsync(destPath);
      if (!destInfo.exists) {
        throw new Error('Move failed - destination file does not exist');
      }
    } catch (error) {
      console.error('Error moving file:', error);
      throw error;
    }
  }

  private async getFileSize(path: string): Promise<number> {
    try {
      const stats = await FileSystem.getInfoAsync(path);
      if (stats.exists) {
        // Use type assertion since we know the file exists
        return (stats as FileSystem.FileInfo & { size: number }).size || 0;
      }
      return 0;
        } catch (error) {
      console.error('Error getting file size:', error);
      return 0;
    }
  }

  async downloadModel(url: string, modelName: string): Promise<{ downloadId: number }> {
    if (!this.isInitialized) {
      throw new Error('ModelDownloader not initialized');
    }

    try {
      await this.initializeDirectory();

      const downloadPath = `${this.downloadDir}/${modelName}`;
      console.log('Starting download:', { url, modelName, downloadPath });

      const task = RNBackgroundDownloader.download({
        id: modelName,
        url,
        destination: downloadPath,
        // Android notification options
        isNotificationVisible: true,
        notificationTitle: `Downloading ${modelName}`,
        // Network resilience options
        isAllowedOverMetered: true,
        isAllowedOverRoaming: true,
        // Network retry options
        maximumRetryCount: 5,
        minimumRetryDelay: 2000,
        maximumRetryDelay: 60000,
        progressInterval: 1000,
        networkTimeout: 30000,
      });

      const downloadId = this.nextDownloadId++;

      this.activeDownloads.set(modelName, {
        task,
        downloadId,
        modelName,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        destination: downloadPath,
        url
      });

      await this.persistActiveDownloads();
      this.attachDownloadHandlers(task);

      return { downloadId };
    } catch (error) {
      console.error('Download error:', error);
      throw error;
    }
  }

  async pauseDownload(downloadId: number): Promise<void> {
    try {
      console.log('Attempting to pause download:', downloadId);
      
      // Find the download entry
      let foundEntry = null;
      let foundModelName = '';
      
      for (const [modelName, entry] of this.activeDownloads.entries()) {
        if (entry.downloadId === downloadId) {
          foundEntry = entry;
          foundModelName = modelName;
          break;
        }
      }

      if (!foundEntry) {
        console.warn('No active download found for ID:', downloadId);
        return;
      }

      console.log('Found task to pause:', { modelName: foundModelName, downloadId });
      
      // Check if platform supports pause
      if (Platform.OS === 'ios' && typeof foundEntry.task.pause === 'function') {
        // Pause the download task
        foundEntry.task.pause();
      } else {
        // On Android, show a notification that pause isn't available
        await this.showNotification(
          'Pause Not Available',
          'Pausing downloads is only available on iOS devices.',
          { modelName: foundModelName }
        );
      }
      
      // Always emit the status update for UI consistency
      this.emit('downloadProgress', {
        modelName: foundModelName,
        progress: foundEntry.progress || 0,
        bytesDownloaded: foundEntry.bytesDownloaded || 0,
        totalBytes: foundEntry.totalBytes || 0,
        status: Platform.OS === 'ios' ? 'paused' : 'downloading',
        downloadId,
        isPaused: Platform.OS === 'ios'
      });

    } catch (error) {
      console.error('Error pausing download:', error);
      throw error;
    }
  }

  async resumeDownload(downloadId: number): Promise<void> {
    try {
      console.log('Attempting to resume download:', downloadId);
      
      // Find the download entry
      let foundEntry = null;
      let foundModelName = '';
      
      for (const [modelName, entry] of this.activeDownloads.entries()) {
        if (entry.downloadId === downloadId) {
          foundEntry = entry;
          foundModelName = modelName;
          break;
        }
      }

      if (!foundEntry) {
        console.warn('No active download found for ID:', downloadId);
        return;
      }

      console.log('Found task to resume:', { modelName: foundModelName, downloadId });
      
      // Check if platform supports resume
      if (Platform.OS === 'ios' && typeof foundEntry.task.resume === 'function') {
        // Resume the download task
        foundEntry.task.resume();
      } else {
        // On Android, show a notification that resume isn't available
        await this.showNotification(
          'Resume Not Available',
          'Resuming downloads is only available on iOS devices.',
          { modelName: foundModelName }
        );
      }
      
      // Always emit the status update for UI consistency
      this.emit('downloadProgress', {
        modelName: foundModelName,
        progress: foundEntry.progress || 0,
        bytesDownloaded: foundEntry.bytesDownloaded || 0,
        totalBytes: foundEntry.totalBytes || 0,
        status: 'downloading',
        downloadId,
        isPaused: false
      });

          } catch (error) {
      console.error('Error resuming download:', error);
      throw error;
    }
  }

  private async cleanupDownload(modelName: string, downloadInfo: DownloadTaskInfo) {
    try {
      // Clean up temp file if it exists
      if (downloadInfo.destination) {
        const tempInfo = await FileSystem.getInfoAsync(downloadInfo.destination);
        if (tempInfo.exists) {
          console.log(`Cleaning up temp file: ${downloadInfo.destination}`);
          await FileSystem.deleteAsync(downloadInfo.destination);
        }
      }

      // Also check and clean up any file in the models directory
      const modelPath = `${this.baseDir}/${modelName}`;
      const modelInfo = await FileSystem.getInfoAsync(modelPath);
      if (modelInfo.exists) {
        console.log(`Cleaning up model file: ${modelPath}`);
        await FileSystem.deleteAsync(modelPath);
      }
      
      // Remove from active downloads
      this.activeDownloads.delete(modelName);
    } catch (error) {
      console.error('Error cleaning up download:', error);
    }
  }

  async cancelDownload(downloadId: number): Promise<void> {
    try {
      console.log('Attempting to cancel download:', downloadId);
      
      let foundEntry = null;
      let foundModelName = '';
      
      for (const [modelName, entry] of this.activeDownloads.entries()) {
        if (entry.downloadId === downloadId) {
          foundEntry = entry;
          foundModelName = modelName;
          break;
        }
      }

      if (!foundEntry) {
        console.warn('No active download found for ID:', downloadId);
        return;
      }

      console.log('Found task to cancel:', { modelName: foundModelName, downloadId });
      
      try {
        // Stop the download task
        await foundEntry.task.stop();
      } catch (stopError) {
        console.error('Error stopping task:', stopError);
      }
      
      // Clean up the download and any residual files
      await this.cleanupDownload(foundModelName, foundEntry);

      // Emit cancellation event
      this.emit('downloadProgress', {
        modelName: foundModelName,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'failed',
        downloadId,
        error: 'Download cancelled'
      });

      // Show cancellation notification
      await this.showNotification(
        'Download Cancelled',
        `${foundModelName} download has been cancelled.`,
        { modelName: foundModelName, action: 'download_cancelled' }
      );
    } catch (error) {
      console.error('Error cancelling download:', error);
      throw error;
    }
  }

  async getStoredModels(): Promise<Array<{ name: string; path: string; size: number }>> {
    try {
      const dir = await FileSystem.readDirectoryAsync(this.baseDir);
      const models = await Promise.all(
        dir.map(async (name) => {
          const path = `${this.baseDir}/${name}`;
          const fileInfo = await FileSystem.getInfoAsync(path);
          const size = fileInfo.exists ? await this.getFileSize(path) : 0;
          return {
            name,
            path,
            size
          };
        })
      );
      return models;
    } catch (error) {
      console.error('Error getting stored models:', error);
      return [];
    }
  }

  async deleteModel(path: string): Promise<void> {
    try {
        await FileSystem.deleteAsync(path);
    } catch (error) {
      console.error('Error deleting model:', error);
      throw error;
    }
  }

  async checkBackgroundDownloads(): Promise<void> {
    try {
      console.log('Checking for completed background downloads...');
      
      // Get list of all files in temp directory
      const tempFiles = await FileSystem.readDirectoryAsync(this.downloadDir);
      console.log('Files in temp directory:', tempFiles);
      
      // Check each active download
      for (const [modelName, downloadInfo] of this.activeDownloads.entries()) {
        console.log(`Checking download status for ${modelName}`);
        
        const modelPath = `${this.baseDir}/${modelName}`;
        const tempPath = downloadInfo.destination;
        
        // Check if model already exists in final location
        const modelExists = (await FileSystem.getInfoAsync(modelPath)).exists;
        if (modelExists) {
          console.log(`Model already exists in final location: ${modelName}`);
          const fileSize = await this.getFileSize(modelPath);
          
          // Emit completion event
          this.emit('downloadProgress', {
            modelName,
            progress: 100,
            bytesDownloaded: fileSize,
            totalBytes: fileSize,
            status: 'completed',
            downloadId: downloadInfo.downloadId
          });
          
          // Clean up download info
          await this.cleanupDownload(modelName, downloadInfo);
          continue;
        }
        
        // Check temp file
        if (tempPath) {
          const tempInfo = await FileSystem.getInfoAsync(tempPath);
          if (tempInfo.exists) {
            const tempSize = await this.getFileSize(tempPath);
            const expectedSize = downloadInfo.totalBytes || 0;
            
            // Consider download complete if file size matches or we have no expected size
            if (tempSize > 0 && (!expectedSize || tempSize >= expectedSize)) {
              console.log(`Found completed download in temp: ${modelName}`);
              try {
                // Move file to final location
                await this.moveFile(tempPath, modelPath);
                const finalSize = await this.getFileSize(modelPath);
                
                // Emit completion event
                this.emit('downloadProgress', {
                  modelName,
                  progress: 100,
                  bytesDownloaded: finalSize,
                  totalBytes: finalSize,
                  status: 'completed',
                  downloadId: downloadInfo.downloadId
                });
                
                // Clean up download info
                await this.cleanupDownload(modelName, downloadInfo);
                
                // Show completion notification
                await this.showNotification(
                  'Download Complete',
                  `${modelName} has been downloaded successfully.`,
                  { modelName, action: 'download_complete' }
                );
              } catch (moveError) {
                console.error(`Error moving completed file for ${modelName}:`, moveError);
                
                // If move fails, mark as failed and clean up
                this.emit('downloadProgress', {
                  modelName,
                  progress: 0,
                  bytesDownloaded: 0,
                  totalBytes: 0,
                  status: 'failed',
                  downloadId: downloadInfo.downloadId,
                  error: 'Failed to move downloaded file'
                });
                
                await this.cleanupDownload(modelName, downloadInfo);
              }
            } else {
              // File exists but is incomplete, try to resume download
              console.log(`Found incomplete download for ${modelName}, attempting to resume`);
              try {
                const task = RNBackgroundDownloader.download({
                  id: modelName,
                  url: downloadInfo.url || '',
                  destination: tempPath,
                  headers: {
                    'Accept-Ranges': 'bytes',
                    'Range': `bytes=${tempSize}-`
                  }
                });
                
                this.attachDownloadHandlers(task as RNBackgroundDownloader.DownloadTask);
    } catch (error) {
                console.error(`Failed to resume download for ${modelName}:`, error);
              }
            }
          } else {
            // Temp file doesn't exist, mark as failed
            console.log(`No temp file found for ${modelName}, marking as failed`);
            this.emit('downloadProgress', {
              modelName,
              progress: 0,
              bytesDownloaded: 0,
              totalBytes: 0,
              status: 'failed',
              downloadId: downloadInfo.downloadId,
              error: 'Download file missing'
            });
            
            await this.cleanupDownload(modelName, downloadInfo);
          }
        }
      }
      
      // Clean up any orphaned files in temp directory
      await this.cleanupTempDirectory();
      
      // Update stored models list
      await this.refreshStoredModels();
      
    } catch (error) {
      console.error('Error checking background downloads:', error);
    }
  }

  private async cleanupTempDirectory() {
    try {
      const downloadDirContents = await FileSystem.readDirectoryAsync(this.downloadDir);
      console.log('Checking temp directory for cleanup:', downloadDirContents);
      
      for (const filename of downloadDirContents) {
        const sourcePath = `${this.downloadDir}/${filename}`;
        const destPath = `${this.baseDir}/${filename}`;
        
        // If file exists in final location or is not being actively downloaded, clean it up
        const finalExists = (await FileSystem.getInfoAsync(destPath)).exists;
        const isActiveDownload = this.activeDownloads.has(filename);
        
        if (finalExists || !isActiveDownload) {
          console.log(`Cleaning up temp file: ${filename}`);
          try {
            await FileSystem.deleteAsync(sourcePath);
          } catch (error) {
            console.error(`Error deleting temp file ${filename}:`, error);
          }
        }
        }
      } catch (error) {
      console.error('Error cleaning up temp directory:', error);
    }
  }

  private async refreshStoredModels() {
    try {
      // Get the current list of stored models
      const storedModels = await this.getStoredModels();
      const storedModelNames = storedModels.map(model => model.name);
      
      // Check the models directory for any new files
      const modelDirContents = await FileSystem.readDirectoryAsync(this.baseDir);
      
      for (const filename of modelDirContents) {
        if (!storedModelNames.includes(filename)) {
          console.log(`Found new model in directory: ${filename}`);
          
          const filePath = `${this.baseDir}/${filename}`;
        const fileInfo = await FileSystem.getInfoAsync(filePath);
          
          if (fileInfo.exists) {
            // Emit a completion event for this model
            const downloadId = this.nextDownloadId++;
            this.emit('downloadProgress', {
              modelName: filename,
            progress: 100,
            bytesDownloaded: fileInfo.size || 0,
            totalBytes: fileInfo.size || 0,
            status: 'completed',
              downloadId
            });
            
            console.log(`Added new model to stored models: ${filename}`);
          }
        }
      }
    } catch (error) {
      console.error('Error refreshing stored models:', error);
    }
  }

  cleanup() {
    const handler = this.handleAppStateChange;
    if (handler) {
      // @ts-ignore - AppState.removeEventListener exists but TypeScript doesn't know about it
      AppState.removeEventListener('change', handler);
    }
    if (this._notificationSubscription) {
      this._notificationSubscription.remove();
    }
  }
}

export const modelDownloader = new ModelDownloader(); 