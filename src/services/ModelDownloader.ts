import RNBackgroundDownloader from '@kesha-antonov/react-native-background-downloader';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState, AppStateStatus, NativeModules } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

type Listener = (...args: any[]) => void;

class EventEmitter {
  private events: { [key: string]: Listener[] } = {};

  on(event: string, listener: Listener): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  off(event: string, listener: Listener): void {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }

  emit(event: string, ...args: any[]): boolean {
    if (!this.events[event]) return false;
    this.events[event].forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
    return true;
  }

  removeAllListeners(event?: string): void {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }
}

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
  task: any;
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
  isExternal?: boolean;
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
  private externalModels: StoredModel[] = [];
  private readonly EXTERNAL_MODELS_KEY = 'external_models';

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

      // Load external models
      await this.loadExternalModels();

      // Set up app state change listener
      AppState.addEventListener('change', this.handleAppStateChange);
      
      // Check for existing background downloads
      try {
        console.log('[ModelDownloader] Checking for existing background downloads...');
        
        // Import the library dynamically to avoid TypeScript errors
        const RNBackgroundDownloader = require('@kesha-antonov/react-native-background-downloader').default;
        
        const existingTasks = await RNBackgroundDownloader.checkForExistingDownloads();
        console.log(`[ModelDownloader] Found ${existingTasks.length} existing background downloads`);
        
        // Re-attach to existing downloads
        for (const task of existingTasks) {
          console.log(`[ModelDownloader] Re-attaching to download: ${task.id}`);
          
          // Extract model name from task id
          const modelName = task.id;
          
          // Create download info
          const downloadInfo = {
            task,
            downloadId: this.nextDownloadId++,
            modelName,
            destination: `${this.downloadDir}/${modelName}`,
          };
          
          // Add to active downloads
          this.activeDownloads.set(modelName, downloadInfo);
          
          // Attach handlers
          this.attachDownloadHandlers(task);
          
          // Emit progress event to update UI
          this.emit('downloadProgress', {
            modelName,
            progress: task.bytesDownloaded / (task.bytesTotal || 1) * 100,
            bytesDownloaded: task.bytesDownloaded,
            totalBytes: task.bytesTotal || 0,
            status: 'downloading',
            downloadId: downloadInfo.downloadId
          });
        }
      } catch (error) {
        console.error('[ModelDownloader] Error checking for existing downloads:', error);
      }

      // Load active downloads
      await this.checkForExistingDownloads();

      // Immediately check for any completed downloads in temp directory
      await this.processCompletedDownloads();

      this.isInitialized = true;
      
      // Clean up temp directory
      await this.cleanupTempDirectory();
    } catch (error) {
      console.error('Error initializing model downloader:', error);
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
      console.log('[ModelDownloader] Initializing directories...');
      console.log('[ModelDownloader] Models directory:', this.baseDir);
      console.log('[ModelDownloader] Temp directory:', this.downloadDir);
      
      // Check if models directory exists
      const modelsDirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!modelsDirInfo.exists) {
        console.log('[ModelDownloader] Models directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
      } else {
        console.log('[ModelDownloader] Models directory already exists');
      }
      
      // Check if temp directory exists
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        console.log('[ModelDownloader] Temp directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.downloadDir, { intermediates: true });
      } else {
        console.log('[ModelDownloader] Temp directory already exists');
      }
      
      // List contents of models directory
      try {
        const modelFiles = await FileSystem.readDirectoryAsync(this.baseDir);
        console.log(`[ModelDownloader] Found ${modelFiles.length} files in models directory:`, modelFiles);
      } catch (error) {
        console.error('[ModelDownloader] Error listing models directory:', error);
      }
      
      // List contents of temp directory
      try {
        const tempFiles = await FileSystem.readDirectoryAsync(this.downloadDir);
        console.log(`[ModelDownloader] Found ${tempFiles.length} files in temp directory:`, tempFiles);
      } catch (error) {
        console.error('[ModelDownloader] Error listing temp directory:', error);
      }
    } catch (error) {
      console.error('[ModelDownloader] Error initializing directories:', error);
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
    console.log('[ModelDownloader] App state changed:', { previous: this.appState, next: nextAppState });
    
    // When app comes to foreground
    if (nextAppState === 'active' && (this.appState === 'background' || this.appState === 'inactive')) {
      console.log('[ModelDownloader] App came to foreground, checking for background downloads...');
      
      try {
        // Process any completed downloads from temp directory
        await this.processCompletedDownloads();
        
        // Check for any downloads completed in the background
        await this.checkBackgroundDownloads();
        
        // Ensure we have latest stored models list
        await this.refreshStoredModels();
        
        // Make sure any active downloads are still running
        await this.ensureDownloadsAreRunning();
    } catch (error) {
        console.error('[ModelDownloader] Error handling app state change:', error);
        }
    }
    
    // When app goes to background
    if (nextAppState === 'background' && this.appState === 'active') {
      console.log('[ModelDownloader] App went to background, persisting active downloads...');
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

  private attachDownloadHandlers(task: any) {
    // Store expected total bytes from begin event
    let expectedTotalBytes = 0;
    const downloadInfo = this.activeDownloads.get(task.id);

    if (!downloadInfo) {
      console.error(`[ModelDownloader] No download info found for task ${task.id}`);
      return;
    }

    // Begin event - fired when download starts
    task.begin((data: any) => {
      const expectedBytes = data.expectedBytes || 0;
      console.log(`[ModelDownloader] Download started for ${task.id}, expected bytes: ${expectedBytes}`);
      expectedTotalBytes = expectedBytes;

      // Update download info
      downloadInfo.totalBytes = expectedBytes;
      
      // Emit progress event
      this.emit('downloadProgress', {
        modelName: downloadInfo.modelName,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: expectedBytes,
        status: 'downloading',
        downloadId: downloadInfo.downloadId
      });
    });
    
    // Progress event - fired periodically during download
    task.progress((data: any) => {
      const bytesDownloaded = data.bytesDownloaded || 0;
      const bytesTotal = data.bytesTotal || expectedTotalBytes || 1;
      
      // Calculate progress percentage
      const progress = Math.round((bytesDownloaded / bytesTotal) * 100);
      
      // Update download info
      downloadInfo.progress = progress;
        downloadInfo.bytesDownloaded = bytesDownloaded;
      downloadInfo.totalBytes = bytesTotal;

      // Emit progress event
        this.emit('downloadProgress', {
        modelName: downloadInfo.modelName,
        progress,
          bytesDownloaded,
        totalBytes: bytesTotal,
          status: 'downloading',
          downloadId: downloadInfo.downloadId
        });
    });
    
    // Done event - fired when download completes successfully
    task.done(async () => {
      console.log(`[ModelDownloader] Download completed for ${task.id}`);
      
      try {
        const tempPath = downloadInfo.destination || `${this.downloadDir}/${downloadInfo.modelName}`;
        const modelPath = `${this.baseDir}/${downloadInfo.modelName}`;
        
        // Check if temp file exists
        const tempInfo = await FileSystem.getInfoAsync(tempPath, { size: true });
        
        if (tempInfo.exists) {
          const tempSize = (tempInfo as any).size || 0;
          
          // Move file to models directory
          await this.moveFile(tempPath, modelPath);
          console.log(`[ModelDownloader] Moved ${downloadInfo.modelName} from temp to models directory`);
          
          // Emit completion event
        this.emit('downloadProgress', {
            modelName: downloadInfo.modelName,
          progress: 100,
            bytesDownloaded: tempSize,
            totalBytes: tempSize,
          status: 'completed',
          downloadId: downloadInfo.downloadId
        });

          // Show notification
          await this.showNotification(
            'Download Complete',
            `${downloadInfo.modelName} has been downloaded successfully.`,
            { modelName: downloadInfo.modelName, action: 'download_complete' }
          );
          
          // Clean up download info
          await this.cleanupDownload(downloadInfo.modelName, downloadInfo);
          
          // Refresh stored models list
          await this.refreshStoredModels();
        } else {
          console.error(`[ModelDownloader] Temp file not found for ${downloadInfo.modelName}`);
          
          // Emit error event
          this.emit('downloadProgress', {
            modelName: downloadInfo.modelName,
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            status: 'failed',
            downloadId: downloadInfo.downloadId,
            error: 'Temp file not found'
          });
        }
      } catch (error) {
        console.error(`[ModelDownloader] Error handling download completion for ${downloadInfo.modelName}:`, error);
        
        // Emit error event
        this.emit('downloadProgress', {
          modelName: downloadInfo.modelName,
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          status: 'failed',
          downloadId: downloadInfo.downloadId,
          error: 'Error handling download completion'
        });
      }
    });
    
    // Error event - fired when download fails
    task.error((data: any) => {
      const error = data.error || 'Unknown error';
      const errorCode = data.errorCode || 0;
      
      console.error(`[ModelDownloader] Download error for ${task.id}:`, error, errorCode);
      
      // Emit error event
      this.emit('downloadProgress', {
        modelName: downloadInfo.modelName,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'failed',
        downloadId: downloadInfo.downloadId,
        error: error
      });
      
      // Clean up download info
      this.cleanupDownload(downloadInfo.modelName, downloadInfo);
    });
  }

  private async moveFile(sourcePath: string, destPath: string): Promise<void> {
    console.log(`[ModelDownloader] Moving file from ${sourcePath} to ${destPath}`);
    
    try {
      // Check if source file exists
      const sourceInfo = await FileSystem.getInfoAsync(sourcePath);
      if (!sourceInfo.exists) {
        throw new Error(`Source file does not exist: ${sourcePath}`);
      }
      
      // Check if destination directory exists
      const destDir = destPath.substring(0, destPath.lastIndexOf('/'));
      const destDirInfo = await FileSystem.getInfoAsync(destDir);
      if (!destDirInfo.exists) {
        console.log(`[ModelDownloader] Creating destination directory: ${destDir}`);
        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      }
      
      // Check if destination file already exists
      const destInfo = await FileSystem.getInfoAsync(destPath);
      if (destInfo.exists) {
        console.log(`[ModelDownloader] Destination file already exists, deleting it: ${destPath}`);
        await FileSystem.deleteAsync(destPath, { idempotent: true });
      }
      
      // Move the file
      console.log(`[ModelDownloader] Executing moveAsync from ${sourcePath} to ${destPath}`);
      await FileSystem.moveAsync({
        from: sourcePath,
        to: destPath
      });
      
      // Verify the file was moved
      const newDestInfo = await FileSystem.getInfoAsync(destPath);
      if (!newDestInfo.exists) {
        throw new Error(`File was not moved successfully to ${destPath}`);
      }
      
      console.log(`[ModelDownloader] File successfully moved to ${destPath}`);
    } catch (error) {
      console.error(`[ModelDownloader] Error moving file from ${sourcePath} to ${destPath}:`, error);
      throw error;
    }
  }

  async getFileSize(path: string): Promise<number> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(path);
      if (!fileInfo.exists) {
      return 0;
      }
      
      // Use getInfoAsync with size option
      const statInfo = await FileSystem.getInfoAsync(path, { size: true });
      
      // Use type assertion to access size property
      return ((statInfo as any).size) || 0;
        } catch (error) {
      console.error(`[ModelDownloader] Error getting file size for ${path}:`, error);
      return 0;
    }
  }

  async downloadModel(url: string, modelName: string): Promise<{ downloadId: number }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Generate a unique download ID
      const downloadId = this.nextDownloadId++;
      await AsyncStorage.setItem('next_download_id', this.nextDownloadId.toString());
      
      // Set destination path
      const destination = `${this.downloadDir}/${modelName}`;
      
      console.log(`[ModelDownloader] Starting download for ${modelName} from ${url}`);
      
      // Import the library dynamically to avoid TypeScript errors
      const RNBackgroundDownloader = require('@kesha-antonov/react-native-background-downloader').default;
      
      // Create download task with type assertion to avoid TypeScript errors
      const task = RNBackgroundDownloader.download({
        id: modelName,
        url,
        destination,
        headers: {
          'Accept-Ranges': 'bytes'
        }
      } as any);
      
      // Store download info
      const downloadInfo = {
        task,
        downloadId,
        modelName,
        destination,
        url
      };

      // Add to active downloads
      this.activeDownloads.set(modelName, downloadInfo);
      
      // Attach handlers
      this.attachDownloadHandlers(task);

      // Save active downloads
      await this.persistActiveDownloads();
      
      // Return download ID
      return { downloadId };
    } catch (error) {
      console.error(`[ModelDownloader] Error starting download for ${modelName}:`, error);
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
      console.log(`[ModelDownloader] Cleaning up download for ${modelName}`);
      
      // Clean up temp file if it exists
      if (downloadInfo.destination) {
        const tempInfo = await FileSystem.getInfoAsync(downloadInfo.destination);
        if (tempInfo.exists) {
          console.log(`[ModelDownloader] Cleaning up temp file: ${downloadInfo.destination}`);
          await FileSystem.deleteAsync(downloadInfo.destination);
        }
      }

      // IMPORTANT: Do NOT delete the file in the models directory
      // This would delete successfully downloaded models
      
      // Remove from active downloads
      this.activeDownloads.delete(modelName);
      
      // Update persisted active downloads
      await this.persistActiveDownloads();
      
      console.log(`[ModelDownloader] Cleanup completed for ${modelName}`);
    } catch (error) {
      console.error(`[ModelDownloader] Error cleaning up download for ${modelName}:`, error);
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

  async getStoredModels(): Promise<StoredModel[]> {
    try {
      console.log('[ModelDownloader] Getting stored models from directory:', this.baseDir);
      
      // First ensure the directory exists
      const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!dirInfo.exists) {
        console.log('[ModelDownloader] Models directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
        return [...this.externalModels]; // Return only external models if no local models
      }
      
      // Read the directory contents
      const dir = await FileSystem.readDirectoryAsync(this.baseDir);
      console.log(`[ModelDownloader] Found ${dir.length} files in models directory:`, dir);
      
      // Process each file
      let localModels: StoredModel[] = [];
      if (dir.length > 0) {
        localModels = await Promise.all(
          dir.map(async (name) => {
            const path = `${this.baseDir}/${name}`;
            const fileInfo = await FileSystem.getInfoAsync(path, { size: true });
            
            // Get file size safely
            let size = 0;
            if (fileInfo.exists) {
              size = (fileInfo as any).size || 0;
            }
            
            // Use current time as modification time
            const modified = new Date().toISOString();
            
            console.log(`[ModelDownloader] Found model: ${name}, size: ${size} bytes`);
            
            return {
              name,
              path,
              size,
              modified,
              isExternal: false
            };
          })
        );
      }
      
      // Combine local and external models
      return [...localModels, ...this.externalModels];
    } catch (error) {
      console.error('[ModelDownloader] Error getting stored models:', error);
      return [...this.externalModels]; // Return only external models on error
    }
  }

  async deleteModel(path: string): Promise<void> {
    try {
      console.log('[ModelDownloader] Deleting model:', path);
      
      // Check if it's an external model
      const externalModelIndex = this.externalModels.findIndex(model => model.path === path);
      if (externalModelIndex !== -1) {
        // Just remove from our list, don't delete the actual file
        this.externalModels.splice(externalModelIndex, 1);
        await this.saveExternalModels();
        this.emit('modelsChanged');
        console.log('[ModelDownloader] Removed external model reference:', path);
        return;
      }
      
      // Otherwise it's a local model, delete the file
      const fileInfo = await FileSystem.getInfoAsync(path);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(path);
        console.log('[ModelDownloader] Deleted model file:', path);
      } else {
        console.log('[ModelDownloader] Model file not found:', path);
      }
      
      // Emit event to notify listeners
      this.emit('modelsChanged');
    } catch (error) {
      console.error('[ModelDownloader] Error deleting model:', error);
      throw error;
    }
  }

  async checkBackgroundDownloads(): Promise<void> {
    try {
      console.log('Checking for completed background downloads...');
      
      // Get list of all files in temp directory
      const tempFiles = await FileSystem.readDirectoryAsync(this.downloadDir);
      console.log('Files in temp directory:', tempFiles);
      
      // First, check all files in temp directory regardless of active downloads
      for (const filename of tempFiles) {
        const tempPath = `${this.downloadDir}/${filename}`;
        const modelPath = `${this.baseDir}/${filename}`;
        
        // Check if file exists in temp
          const tempInfo = await FileSystem.getInfoAsync(tempPath);
          if (tempInfo.exists) {
            const tempSize = await this.getFileSize(tempPath);
            
          // If file has size > 0, consider it complete and try to move it
          if (tempSize > 0) {
              try {
              // Check if it's already in models directory
              const modelExists = (await FileSystem.getInfoAsync(modelPath)).exists;
              if (!modelExists) {
                await this.moveFile(tempPath, modelPath);
                console.log(`Moved completed download to models: ${filename}`);
                
                // Emit completion event
                const downloadId = this.nextDownloadId++;
                this.emit('downloadProgress', {
                  modelName: filename,
                  progress: 100,
                  bytesDownloaded: tempSize,
                  totalBytes: tempSize,
                  status: 'completed',
                  downloadId
                });
                
                // Show completion notification
                await this.showNotification(
                  'Download Complete',
                  `${filename} has been downloaded successfully.`,
                  { modelName: filename, action: 'download_complete' }
                );
              }
              } catch (moveError) {
              console.error(`Error moving completed file for ${filename}:`, moveError);
            }
          }
        }
      }
      
      // Then check active downloads
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
      console.log('[ModelDownloader] Checking temp directory for cleanup...');
      
      // Check if temp directory exists
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        console.log('[ModelDownloader] Temp directory does not exist, nothing to clean up');
        return;
      }
      
      // Get list of files in temp directory
      const downloadDirContents = await FileSystem.readDirectoryAsync(this.downloadDir);
      console.log(`[ModelDownloader] Found ${downloadDirContents.length} files in temp directory:`, downloadDirContents);
      
      // Check each file
      for (const filename of downloadDirContents) {
        const sourcePath = `${this.downloadDir}/${filename}`;
        const destPath = `${this.baseDir}/${filename}`;
        
        // Check if file already exists in models directory
        const destInfo = await FileSystem.getInfoAsync(destPath);
        if (destInfo.exists) {
          console.log(`[ModelDownloader] File ${filename} already exists in models directory, removing from temp`);
          try {
            await FileSystem.deleteAsync(sourcePath, { idempotent: true });
          } catch (error) {
            console.error(`[ModelDownloader] Error deleting temp file ${filename}:`, error);
          }
          continue;
        }
        
        // Check if file is still being downloaded
        const isActiveDownload = this.activeDownloads.has(filename);
        if (isActiveDownload) {
          console.log(`[ModelDownloader] File ${filename} is still being downloaded, skipping`);
          continue;
        }
        
        // Check if file is complete (has size > 0)
        const sourceInfo = await FileSystem.getInfoAsync(sourcePath, { size: true });
        if (sourceInfo.exists && (sourceInfo as any).size > 0) {
          console.log(`[ModelDownloader] Found completed download in temp: ${filename}, moving to models directory`);
          try {
            // Make sure models directory exists
            await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true }).catch(() => {});
            
            // Move file to models directory
            await this.moveFile(sourcePath, destPath);
            console.log(`[ModelDownloader] Successfully moved ${filename} from temp to models directory`);
          } catch (error) {
            console.error(`[ModelDownloader] Error moving file ${filename} from temp to models:`, error);
          }
        } else {
          console.log(`[ModelDownloader] File ${filename} in temp directory is empty or invalid, skipping`);
        }
      }
    } catch (error) {
      console.error('[ModelDownloader] Error cleaning up temp directory:', error);
    }
  }

  async refreshStoredModels() {
    try {
      console.log('[ModelDownloader] Refreshing stored models list...');
      // Get the current list of stored models
      const storedModels = await this.getStoredModels();
      const storedModelNames = storedModels.map(model => model.name);
      
      // Check the models directory for any new files
      const modelDirContents = await FileSystem.readDirectoryAsync(this.baseDir);
      
      for (const filename of modelDirContents) {
        if (!storedModelNames.includes(filename)) {
          console.log(`[ModelDownloader] Found new model in directory: ${filename}`);
          
          const filePath = `${this.baseDir}/${filename}`;
          const fileInfo = await FileSystem.getInfoAsync(filePath, { size: true });
          
          if (fileInfo.exists) {
            // Emit a completion event for this model
            const downloadId = this.nextDownloadId++;
            this.emit('downloadProgress', {
              modelName: filename,
            progress: 100,
              bytesDownloaded: (fileInfo as any).size || 0,
              totalBytes: (fileInfo as any).size || 0,
            status: 'completed',
              downloadId
            });
            
            console.log(`[ModelDownloader] Added new model to stored models: ${filename}`);
          }
        }
      }
    } catch (error) {
      console.error('[ModelDownloader] Error refreshing stored models:', error);
    }
  }

  async processCompletedDownloads() {
    console.log('[ModelDownloader] Processing completed downloads from temp directory...');
    try {
      // First ensure both directories exist
      const tempDirInfo = await FileSystem.getInfoAsync(this.downloadDir);
      if (!tempDirInfo.exists) {
        console.log('[ModelDownloader] Temp directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.downloadDir, { intermediates: true });
        return;
      }
      
      const modelsDirInfo = await FileSystem.getInfoAsync(this.baseDir);
      if (!modelsDirInfo.exists) {
        console.log('[ModelDownloader] Models directory does not exist, creating it');
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
      }
      
      // Get all files from temp directory
      const tempFiles = await FileSystem.readDirectoryAsync(this.downloadDir);
      
      if (tempFiles.length === 0) {
        console.log('[ModelDownloader] No files found in temp directory');
        return;
      }
      
      console.log(`[ModelDownloader] Found ${tempFiles.length} files in temp directory:`, tempFiles);
      
      // Process each file in temp directory
      for (const filename of tempFiles) {
        const tempPath = `${this.downloadDir}/${filename}`;
        const modelPath = `${this.baseDir}/${filename}`;
        
        // Check if file already exists in models directory
        const modelExists = (await FileSystem.getInfoAsync(modelPath)).exists;
        if (modelExists) {
          console.log(`[ModelDownloader] Model ${filename} already exists in final location, removing temp file`);
          try {
            await FileSystem.deleteAsync(tempPath, { idempotent: true });
          } catch (e) {
            console.error(`[ModelDownloader] Error removing temp file for ${filename}:`, e);
          }
          continue;
        }
        
        // Check temp file
        const tempInfo = await FileSystem.getInfoAsync(tempPath, { size: true });
        
        if (tempInfo.exists && (tempInfo as any).size && (tempInfo as any).size > 0) {
          console.log(`[ModelDownloader] Found potentially completed download in temp: ${filename} (${(tempInfo as any).size} bytes)`);
          
          try {
            // Move the file to models directory
            console.log(`[ModelDownloader] Moving ${filename} from ${tempPath} to ${modelPath}`);
            await this.moveFile(tempPath, modelPath);
            console.log(`[ModelDownloader] Successfully moved ${filename} from temp to models directory`);
            
            // Verify the file was moved successfully
            const modelInfo = await FileSystem.getInfoAsync(modelPath, { size: true });
            if (!modelInfo.exists) {
              throw new Error(`File was not moved successfully to ${modelPath}`);
            }
            
            // Generate download ID for this model
            const downloadId = this.nextDownloadId++;
            await AsyncStorage.setItem('next_download_id', this.nextDownloadId.toString());
            
            // Emit completion event
            this.emit('downloadProgress', {
              modelName: filename,
              progress: 100,
              bytesDownloaded: (tempInfo as any).size,
              totalBytes: (tempInfo as any).size,
              status: 'completed',
              downloadId
            });
            
            // Show notification
            await this.showNotification(
              'Download Complete',
              `${filename} has been downloaded successfully and is ready to use.`,
              { modelName: filename, action: 'download_complete' }
            );
          } catch (error) {
            console.error(`[ModelDownloader] Error processing completed download for ${filename}:`, error);
          }
        } else {
          console.log(`[ModelDownloader] File ${filename} in temp directory is empty or invalid`);
        }
      }
      
      // Refresh stored models list
      await this.refreshStoredModels();
      
    } catch (error) {
      console.error('[ModelDownloader] Error processing completed downloads:', error);
    }
  }

  // Add the linkExternalModel method
  async linkExternalModel(uri: string, fileName: string): Promise<void> {
    try {
      console.log(`[ModelDownloader] Linking external model: ${fileName} from ${uri}`);
      
      // Check if file with same name already exists in models directory
      const destPath = `${this.baseDir}/${fileName}`;
      const destInfo = await FileSystem.getInfoAsync(destPath);
      if (destInfo.exists) {
        throw new Error('A model with this name already exists in the models directory');
      }

      // Check if file with same name already exists in external models
      const existingExternal = this.externalModels.find(model => model.name === fileName);
      if (existingExternal) {
        throw new Error('A model with this name already exists in external models');
      }

      // Get the file info to verify it exists and get its size
      const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
      if (!fileInfo.exists) {
        throw new Error('External file does not exist');
      }

      // For Android content:// URIs, we need to copy the file to our app's directory
      // because native modules can't directly access content:// URIs
      let finalPath = uri;
      let isExternal = true;
      
      if (Platform.OS === 'android' && uri.startsWith('content://')) {
        console.log(`[ModelDownloader] Android content URI detected, copying file to app directory`);
        
        // Create a copy in our app's models directory
        const appModelPath = `${this.baseDir}/${fileName}`;
        
        try {
          // Ensure the models directory exists
          const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
          }
          
          // Copy the file to our app's directory
          await FileSystem.copyAsync({
            from: uri,
            to: appModelPath
          });
          
          // Use the app path instead of the content URI
          finalPath = appModelPath;
          isExternal = false; // It's now a local file
          
          console.log(`[ModelDownloader] Successfully copied model to: ${appModelPath}`);
        } catch (error) {
          console.error(`[ModelDownloader] Error copying file:`, error);
          throw new Error('Failed to copy the model file to the app directory');
        }
      }

      // If we're not copying (non-Android or non-content URI), just store the reference
      if (isExternal) {
        // Add to external models list with the URI
        const newExternalModel: StoredModel = {
          name: fileName,
          path: finalPath,
          size: (fileInfo as any).size || 0,
          modified: new Date().toISOString(),
          isExternal: true
        };

        this.externalModels.push(newExternalModel);
        await this.saveExternalModels();
      }
      
      // Emit event to notify listeners
      this.emit('modelsChanged');
      
      console.log(`[ModelDownloader] Successfully linked model: ${fileName} at path: ${finalPath}`);
    } catch (error) {
      console.error(`[ModelDownloader] Error linking model: ${fileName}`, error);
      throw error;
    }
  }

  private async loadExternalModels() {
    try {
      const externalModelsJson = await AsyncStorage.getItem(this.EXTERNAL_MODELS_KEY);
      if (externalModelsJson) {
        this.externalModels = JSON.parse(externalModelsJson);
        console.log('[ModelDownloader] Loaded external models:', this.externalModels);
      }
    } catch (error) {
      console.error('[ModelDownloader] Error loading external models:', error);
      this.externalModels = [];
    }
  }

  private async saveExternalModels() {
    try {
      await AsyncStorage.setItem(this.EXTERNAL_MODELS_KEY, JSON.stringify(this.externalModels));
      console.log('[ModelDownloader] Saved external models:', this.externalModels);
    } catch (error) {
      console.error('[ModelDownloader] Error saving external models:', error);
    }
  }
}

export const modelDownloader = new ModelDownloader(); 