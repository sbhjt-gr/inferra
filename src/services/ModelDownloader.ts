import AsyncStorage from '@react-native-async-storage/async-storage';
// Import React Native modules using require
const ReactNative = require('react-native');
const { NativeModules, Platform, AppState, NativeEventEmitter, PermissionsAndroid } = ReactNative;

// Debug log available native modules
console.log('Available Native Modules:', Object.keys(NativeModules));
console.log('ModelDownloaderModule:', NativeModules.ModelDownloaderModule);
console.log('FileSystemModule:', NativeModules.FileSystemModule);

// Extract modules with verification
const ModelDownloaderModule = NativeModules.ModelDownloaderModule as ModelDownloaderModuleType;
if (!ModelDownloaderModule) {
  console.error('ModelDownloaderModule not found! App will have limited functionality.');
}

const FileSystemModule = NativeModules.FileSystemModule as FileSystemModuleType;
if (!FileSystemModule) {
  console.error('FileSystemModule not found! App will have limited functionality.');
}

// Define types for our native modules
interface ModelDownloaderModuleType {
  downloadModel: (url: string, modelName: string) => Promise<{ downloadId: string }>;
  cancelDownload: (downloadId: string) => Promise<void>;
  addListener: (eventType: string) => void;
  removeListeners: (count: number) => void;
  pauseDownload: (downloadId: string) => Promise<void>;
  resumeDownload: (downloadId: string) => Promise<{ downloadId: string }>;
  checkBackgroundDownloads: () => Promise<void>;
}

interface FileSystemModuleType {
  documentDirectory: string;
  cacheDirectory: string;
  makeDirectoryAsync: (path: string, options: { intermediates: boolean }) => Promise<void>;
  readDirectoryAsync: (path: string) => Promise<string[]>;
  getInfoAsync: (path: string, options: { size: boolean }) => Promise<{ exists: boolean; size?: number; isDirectory?: boolean; modificationTime?: number }>;
  deleteAsync: (path: string, options: { idempotent: boolean }) => Promise<void>;
  moveAsync: (options: { from: string; to: string }) => Promise<void>;
  copyAsync: (options: { from: string; to: string }) => Promise<void>;
}

// Define notification module interface
interface DownloadNotificationModuleInterface {
  showDownloadNotification(modelName: string, downloadId: string, progress: number): Promise<boolean>;
  updateDownloadProgress(downloadId: string, progress: number): Promise<boolean>;
  cancelNotification(downloadId: string): Promise<boolean>;
}

// Get the native modules with proper typing
const DownloadNotificationModule = NativeModules.DownloadNotificationModule as DownloadNotificationModuleInterface;

// Create event emitter for native module events
const eventEmitter = new NativeEventEmitter(ModelDownloaderModule);

// Event types
interface DownloadProgressEvent {
  modelName: string;
  downloadId: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  isCompleted: boolean;
  isPaused?: boolean;
  error?: string;
}

interface DownloadErrorEvent {
  modelName: string;
  downloadId: string;
  error: string;
}

interface StoredNotification {
  id: string;
  title: string;
  description: string;
  timestamp: number;
  type: string;
  downloadId?: number;
}

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
  options?: any;
}

interface DownloadTaskInfo {
  task?: any;
  downloadId: number;
  modelName: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed';
  destination?: string;
  url?: string;
  lastUpdated: number;
  isPaused?: boolean;
  error?: string;
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
  private appState: string = AppState.currentState;
  private isInitialized: boolean = false;
  private hasNotificationPermission: boolean = false;
  private _notificationSubscription: any = null;
  private wasOpenedViaNotification: boolean = false;
  private externalModels: StoredModel[] = [];
  private readonly EXTERNAL_MODELS_KEY = 'external_models';
  private readonly DOWNLOAD_PROGRESS_KEY = 'download_progress_state';
  private readonly NOTIFICATIONS_KEY = 'stored_notifications';
  private nativeEventEmitter: any;

  constructor() {
    super();
    this.baseDir = 'models';  // Path relative to internal storage root
    this.downloadDir = 'temp'; // Path for temporary downloads
    
    console.log('[ModelDownloader] Initializing with base directory:', this.baseDir);
    console.log('[ModelDownloader] Platform:', Platform.OS);
    
    this.nativeEventEmitter = new NativeEventEmitter(NativeModules.ModelDownloaderModule);
    this.initialize();
  }

  private async initialize() {
    try {
      // Initialize directories
      await this.initializeDirectory();
      
      // Load next download ID
      const savedId = await AsyncStorage.getItem('next_download_id');
      if (savedId) {
        this.nextDownloadId = parseInt(savedId, 10);
      }

      // Load external models
      await this.loadExternalModels();

      // Load saved download progress
      await this.loadDownloadProgress();

      // Set up app state change listener
      AppState.addEventListener('change', this.handleAppStateChange);
      
      // Remove any existing listeners before adding new ones
      if (Platform.OS === 'android') {
        this.nativeEventEmitter.removeAllListeners('downloadProgress');
        this.nativeEventEmitter.removeAllListeners('downloadError');
        
        // Set up native module event listeners
        this.nativeEventEmitter.addListener('downloadProgress', this.handleNativeDownloadProgress);
        this.nativeEventEmitter.addListener('downloadError', this.handleNativeDownloadError);
      }

      this.isInitialized = true;
      
      // Clean up temp directory
      await this.cleanupTempDirectory();
    } catch (error) {
      console.error('Error initializing model downloader:', error);
    }
  }

  private handleNativeDownloadProgress = (event: DownloadProgressEvent) => {
    const { modelName, downloadId, progress, bytesDownloaded, totalBytes, isCompleted, isPaused, error } = event;
    const filename = modelName.split('/').pop() || modelName;
    const existingDownload = this.activeDownloads.get(filename);
    
    const validProgress = Math.min(100, Math.max(0, progress));
    const validBytesDownloaded = Math.max(0, bytesDownloaded);
    const validTotalBytes = Math.max(0, totalBytes);
    
    const status = error ? 'failed' : 
                  isCompleted ? 'completed' : 
                  isPaused ? 'paused' : 'downloading';

    const downloadInfo: DownloadTaskInfo = {
      ...existingDownload,
      downloadId: parseInt(downloadId.toString()),
      modelName: filename,
      progress: validProgress,
      bytesDownloaded: validBytesDownloaded,
      totalBytes: validTotalBytes,
      status,
      isPaused,
      error,
      lastUpdated: Date.now()
    };

    this.activeDownloads.set(filename, downloadInfo);
    
    // Save progress to storage
    this.saveDownloadProgress(filename, downloadInfo).catch(error => 
      console.error('Error saving download progress:', error)
    );

    // Emit progress event
    this.emit('downloadProgress', {
      modelName: filename,
      ...downloadInfo
    });
  };

  private handleNativeDownloadError = (event: any) => {
    const { modelName, downloadId, error } = event;
    
    this.emit('downloadProgress', {
      modelName,
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      status: 'failed',
      downloadId: parseInt(downloadId),
      error
    });

    this.activeDownloads.delete(modelName);
  };

  private async setupNotifications() {
    if (Platform.OS === 'android') {
      await this.requestNotificationPermissions();
    }
  }

  private async requestNotificationPermissions(): Promise<boolean> {
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
        
        this.hasNotificationPermission = granted === PermissionsAndroid.RESULTS.GRANTED;
        return this.hasNotificationPermission;
      }
      
      // For older Android versions, permission is granted by default
      this.hasNotificationPermission = true;
      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
    return false;
    }
  }

  private async initializeDirectory() {
    try {
      console.log('[ModelDownloader] Initializing directories...');
      console.log('[ModelDownloader] Models directory:', this.baseDir);
      console.log('[ModelDownloader] Temp directory:', this.downloadDir);
      
      if (!this.baseDir || !this.downloadDir) {
        throw new Error('FileSystemModule directories are not available');
      }

      // Create models directory if it doesn't exist
      await FileSystemModule.makeDirectoryAsync(this.baseDir, { intermediates: true });
      
      // Create temp directory if it doesn't exist
      await FileSystemModule.makeDirectoryAsync(this.downloadDir, { intermediates: true });
      
      // List contents of models directory
      try {
        const modelFiles = await FileSystemModule.readDirectoryAsync(this.baseDir);
        console.log(`[ModelDownloader] Found ${modelFiles.length} files in models directory:`, modelFiles);
        
        // Check each file's existence and size
        for (const file of modelFiles) {
          const filePath = `${this.baseDir}/${file}`;
          const fileInfo = await FileSystemModule.getInfoAsync(filePath, { size: true });
          console.log(`[ModelDownloader] File ${file}:`, {
            exists: fileInfo.exists,
            size: fileInfo.size,
            path: filePath
          });
        }
      } catch (error) {
        console.error('[ModelDownloader] Error listing models directory:', error);
      }
      
      // List contents of temp directory
      try {
        const tempFiles = await FileSystemModule.readDirectoryAsync(this.downloadDir);
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
      const savedDownloads = await AsyncStorage.getItem('active_downloads');
      if (savedDownloads) {
        const downloads = JSON.parse(savedDownloads);
        console.log('[ModelDownloader] Found saved downloads:', downloads);

        for (const [modelName, downloadState] of Object.entries(downloads)) {
          const { downloadId, destination, url, progress, bytesDownloaded, totalBytes, status } = downloadState as any;
          
          // Check if the file exists in temp directory
          const fileInfo = await FileSystemModule.getInfoAsync(destination, { size: false });
          if (fileInfo.exists) {
            console.log(`[ModelDownloader] Found existing download for ${modelName}`);
            
            // Re-emit progress event
            this.emit('downloadProgress', {
              modelName,
              progress,
              bytesDownloaded,
              totalBytes,
              status,
              downloadId
            });
          } else {
            console.log(`[ModelDownloader] Temp file not found for ${modelName}, cleaning up state`);
            // File doesn't exist, emit failed status
            this.emit('downloadProgress', {
              modelName,
              progress: 0,
              bytesDownloaded: 0,
              totalBytes: 0,
              status: 'failed',
              downloadId,
              error: 'Download file not found'
            });
            
            // Clean up the download state
            const downloadInfo = {
              downloadId,
              destination,
              modelName,
              url
            };
            await this.cleanupDownload(modelName, downloadInfo as DownloadTaskInfo);
          }
        }
      }
    } catch (error) {
      console.error('[ModelDownloader] Error checking for existing downloads:', error);
    }
  }

  private handleAppStateChange = async (nextAppState: string) => {
    console.log('[ModelDownloader] App state changed to:', nextAppState);
    
    // Only cancel downloads when app is closed (removed from recents)
    // 'inactive' means the app is being closed/removed from recents
    if (nextAppState === 'inactive') {
      console.log('[ModelDownloader] App is being closed, cancelling all downloads');
      
      // Cancel all active downloads
      for (const [modelName, downloadInfo] of Array.from(this.activeDownloads.entries())) {
        try {
          await this.cancelDownload(downloadInfo.downloadId);
          this.emit('downloadProgress', {
            modelName,
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            status: 'failed',
            downloadId: downloadInfo.downloadId,
            error: 'Download cancelled - app was closed'
          });
        } catch (error) {
          console.error(`[ModelDownloader] Error cancelling download for ${modelName}:`, error);
        }
      }
      
      // Clear active downloads
      this.activeDownloads.clear();
    }
  };

  private async persistActiveDownloads() {
    try {
      const downloadsToSave = Array.from(this.activeDownloads.entries()).reduce((acc, [modelName, info]) => {
        acc[modelName] = {
          downloadId: info.downloadId,
          destination: info.destination || '',
          url: info.url || '',
          progress: info.progress || 0,
          bytesDownloaded: info.bytesDownloaded || 0,
          totalBytes: info.totalBytes || 0,
          status: 'downloading'
        };
        return acc;
      }, {} as Record<string, any>);

      await AsyncStorage.setItem('active_downloads', JSON.stringify(downloadsToSave));
      console.log('[ModelDownloader] Persisted active downloads:', downloadsToSave);
    } catch (error) {
      console.error('[ModelDownloader] Error persisting active downloads:', error);
    }
  }

  private async showNotification(modelName: string, downloadId: number, progress: number): Promise<boolean> {
    try {
      if (Platform.OS !== 'android' || !DownloadNotificationModule) return false;
      
      // Request permissions if we don't have them yet
      if (!this.hasNotificationPermission) {
        await this.requestNotificationPermissions();
      }
      
      return await DownloadNotificationModule.showDownloadNotification(
        modelName, 
        downloadId.toString(), 
        Math.round(progress)
      );
      } catch (error) {
      console.error('Error showing notification:', error);
      return false;
    }
  }

  private async updateNotificationProgress(downloadId: number, progress: number): Promise<boolean> {
    try {
      if (Platform.OS !== 'android' || !DownloadNotificationModule) return false;
      
      return await DownloadNotificationModule.updateDownloadProgress(
        downloadId.toString(), 
        Math.round(progress)
      );
    } catch (error) {
      console.error('Error updating notification progress:', error);
      return false;
    }
  }

  private async cancelNotification(downloadId: number): Promise<boolean> {
    try {
      if (Platform.OS !== 'android' || !DownloadNotificationModule) return false;
      
      return await DownloadNotificationModule.cancelNotification(downloadId.toString());
    } catch (error) {
      console.error('Error cancelling notification:', error);
      return false;
    }
  }

  private async storeNotification(title: string, description: string, type: string, downloadId?: number) {
    try {
      const existingNotificationsJson = await AsyncStorage.getItem(this.NOTIFICATIONS_KEY);
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
      
      await AsyncStorage.setItem(this.NOTIFICATIONS_KEY, JSON.stringify(notifications));
    } catch (error) {
      console.error('Error storing notification:', error);
    }
  }

  private formatBytes(bytes: number | undefined | null, decimals = 2): string {
    if (!bytes || isNaN(bytes) || bytes === 0) return '0 B';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  private async moveFile(sourcePath: string, destPath: string): Promise<void> {
    console.log(`[ModelDownloader] Moving file from ${sourcePath} to ${destPath}`);
    
    try {
      // Sanitize paths by encoding URI components
      const sanitizedSourcePath = sourcePath.split('/').map(part => encodeURIComponent(part)).join('/');
      const sanitizedDestPath = destPath.split('/').map(part => encodeURIComponent(part)).join('/');
      
      const modelName = destPath.split('/').pop() || 'model';
      console.log(`[ModelDownloader] Emitting importProgress event for ${modelName} (importing)`);
      
      // Emit event to show importing dialog
      this.emit('importProgress', {
        modelName,
        status: 'importing'
      });

      // Check if source file exists
      const sourceInfo = await FileSystemModule.getInfoAsync(sanitizedSourcePath, { size: true });
      if (!sourceInfo.exists) {
        throw new Error(`Source file does not exist: ${sourcePath}`);
      }
      
      // Check if destination directory exists
      const destDir = sanitizedDestPath.substring(0, sanitizedDestPath.lastIndexOf('/'));
      const destDirInfo = await FileSystemModule.getInfoAsync(destDir, { size: false });
      if (!destDirInfo.exists) {
        console.log(`[ModelDownloader] Creating destination directory: ${destDir}`);
        await FileSystemModule.makeDirectoryAsync(destDir, { intermediates: true });
      }
      
      // Check if destination file already exists
      const destInfo = await FileSystemModule.getInfoAsync(sanitizedDestPath, { size: false });
      if (destInfo.exists) {
        console.log(`[ModelDownloader] Destination file already exists, deleting it: ${sanitizedDestPath}`);
        await FileSystemModule.deleteAsync(sanitizedDestPath, { idempotent: true });
      }
      
      // Move the file
      console.log(`[ModelDownloader] Executing moveAsync from ${sanitizedSourcePath} to ${sanitizedDestPath}`);
      await FileSystemModule.moveAsync({
        from: sanitizedSourcePath,
        to: sanitizedDestPath
      });
      
      // Verify the file was moved
      const newDestInfo = await FileSystemModule.getInfoAsync(sanitizedDestPath, { size: true });
      if (!newDestInfo.exists) {
        throw new Error(`File was not moved successfully to ${destPath}`);
      }

      console.log(`[ModelDownloader] Emitting importProgress event for ${modelName} (completed)`);
      // Emit event to hide importing dialog
      this.emit('importProgress', {
        modelName,
        status: 'completed'
      });
      
      console.log(`[ModelDownloader] File successfully moved to ${destPath}`);
    } catch (error) {
      const modelName = destPath.split('/').pop() || 'model';
      console.log(`[ModelDownloader] Emitting importProgress event for ${modelName} (error)`);
      // Emit event to hide importing dialog with error
      this.emit('importProgress', {
        modelName,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      console.error(`[ModelDownloader] Error moving file from ${sourcePath} to ${destPath}:`, error);
      throw error;
    }
  }

  async getFileSize(path: string): Promise<number> {
    try {
      const fileInfo = await FileSystemModule.getInfoAsync(path, { size: true });
      if (!fileInfo.exists) {
      return 0;
      }
      return fileInfo.size || 0;
        } catch (error) {
      console.error(`[ModelDownloader] Error getting file size for ${path}:`, error);
      return 0;
    }
  }

  async downloadModel(url: string, modelName: string): Promise<{ downloadId: number }> {
    try {
      const result = await ModelDownloaderModule.downloadModel(url, modelName);
      console.log(`[ModelDownloader] Download started with ID: ${result.downloadId}`);
      
      const downloadId = parseInt(result.downloadId);
      
      const downloadInfo: DownloadTaskInfo = {
        task: null,
        downloadId,
        modelName,
        url,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'queued',
        lastUpdated: Date.now()
      };

      this.activeDownloads.set(modelName, downloadInfo);
      return { downloadId };
    } catch (error) {
      console.error('Error starting download:', error);
      throw error;
    }
  }

  async pauseDownload(downloadId: number): Promise<void> {
    console.log(`[ModelDownloader] Attempting to pause download with ID ${downloadId}`);
    
    try {
      // Find the download entry
      let foundEntry: DownloadTaskInfo | undefined;
      let foundModelName = '';
      
      for (const [taskId, entry] of this.activeDownloads.entries()) {
        if (entry.downloadId === downloadId) {
          foundEntry = entry;
          foundModelName = entry.modelName;
          break;
        }
      }
      
      if (!foundEntry) {
        console.warn(`[ModelDownloader] No active download found with ID ${downloadId}`);
        return;
      }
      
      // Check if platform supports pause
      if (Platform.OS === 'ios' && typeof foundEntry.task.pause === 'function') {
        // Pause the download task
        foundEntry.task.pause();
        
        // Store notification for paused download
        await this.storeNotification(
          'Download Paused',
          `${foundModelName} download has been paused`,
          'download_paused',
            downloadId
          );
      } else if (Platform.OS === 'ios') {
        // Store notification for pause unavailable
        await this.storeNotification(
          'Pause Not Available',
          `Pausing ${foundModelName} download is not supported`,
          'download_pause_unavailable',
            downloadId
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
        isPaused: true
      });
    } catch (error) {
      console.error(`[ModelDownloader] Error pausing download:`, error);
    }
  }

  async resumeDownload(downloadId: number): Promise<{ downloadId: number }> {
    try {
      const result = await ModelDownloaderModule.resumeDownload(downloadId.toString());
      const newDownloadId = parseInt(result.downloadId);
      
      // Update active downloads with new ID if changed
      for (const [modelName, info] of this.activeDownloads.entries()) {
        if (info.downloadId === downloadId) {
          this.activeDownloads.set(modelName, {
            ...info,
            downloadId: newDownloadId,
            isPaused: false,
            status: 'downloading',
            lastUpdated: Date.now()
          });
          break;
        }
      }
      
      return { downloadId: newDownloadId };
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
        const tempInfo = await FileSystemModule.getInfoAsync(downloadInfo.destination, { size: false });
        if (tempInfo.exists) {
          console.log(`[ModelDownloader] Cleaning up temp file: ${downloadInfo.destination}`);
          await FileSystemModule.deleteAsync(downloadInfo.destination, { idempotent: true });
        }
      }

      // Cancel notification on Android
      if (Platform.OS === 'android' && downloadInfo.downloadId) {
        await this.cancelNotification(downloadInfo.downloadId);
      }
      
      // Remove from active downloads
      this.activeDownloads.delete(modelName);
      
      // Clear progress state
      await this.clearDownloadProgress(modelName);
      
      // Update persisted active downloads
      await this.persistActiveDownloads();
      
      console.log(`[ModelDownloader] Cleanup completed for ${modelName}`);
    } catch (error) {
      console.error(`[ModelDownloader] Error cleaning up download for ${modelName}:`, error);
    }
  }

  async cancelDownload(downloadId: number): Promise<void> {
    try {
      await ModelDownloaderModule.cancelDownload(downloadId.toString());
      
      // Find and remove the canceled download
      for (const [modelName, info] of this.activeDownloads.entries()) {
        if (info.downloadId === downloadId) {
          await this.cleanupDownload(modelName, info);
          break;
        }
      }
    } catch (error) {
      console.error('Error canceling download:', error);
      throw error;
    }
  }

  async getStoredModels(): Promise<StoredModel[]> {
    try {
      console.log('[ModelDownloader] Getting stored models from directory:', this.baseDir);
      console.log('[ModelDownloader] Current platform:', Platform.OS);
      
      // First ensure the directory exists
      const dirInfo = await FileSystemModule.getInfoAsync(this.baseDir, { size: false });
      console.log('[ModelDownloader] Models directory info:', dirInfo);
      
      if (!dirInfo.exists) {
        console.log('[ModelDownloader] Models directory does not exist, creating it');
        await FileSystemModule.makeDirectoryAsync(this.baseDir, { intermediates: true });
        console.log('[ModelDownloader] Created models directory');
        return [...this.externalModels]; // Return only external models if no local models
      }
      
      // Read the directory contents
      const dir = await FileSystemModule.readDirectoryAsync(this.baseDir);
      console.log(`[ModelDownloader] Found ${dir.length} files in models directory:`, dir);
      
      // Process each file
      let localModels: StoredModel[] = [];
      if (dir.length > 0) {
        localModels = await Promise.all(
          dir.map(async (name: string) => {
            const path = `${this.baseDir}/${name}`;
            console.log(`[ModelDownloader] Checking file: ${name} at path: ${path}`);
            
            const fileInfo = await FileSystemModule.getInfoAsync(path, { size: true });
            console.log(`[ModelDownloader] File info for ${name}:`, fileInfo);
            
            // Get file size safely
            let size = 0;
            if (fileInfo.exists) {
              size = fileInfo.size || 0;
              console.log(`[ModelDownloader] File ${name} exists with size: ${size} bytes`);
            } else {
              console.log(`[ModelDownloader] File ${name} does not exist, trying alternate path verification`);
              try {
                // Try additional path verification for Android internal storage
                const alternatePath = `${this.baseDir}/${name.replace(/\s/g, '_')}`;
                const alternateInfo = await FileSystemModule.getInfoAsync(alternatePath, { size: true });
                if (alternateInfo.exists) {
                  size = alternateInfo.size || 0;
                  console.log(`[ModelDownloader] File found with alternate path: ${alternatePath}, size: ${size} bytes`);
                }
              } catch (e) {
                console.log('[ModelDownloader] Error checking alternate path:', e);
              }
            }
            
            // Use current time as modification time if not available
            const modified = fileInfo.modificationTime ? 
              new Date(fileInfo.modificationTime).toISOString() : 
              new Date().toISOString();
            
            const model = {
              name,
              path,
              size,
              modified,
              isExternal: false
            };
            console.log(`[ModelDownloader] Created model object:`, model);
            return model;
          })
        );
      }
      
      // Log the final results
      console.log('[ModelDownloader] Local models found:', localModels);
      console.log('[ModelDownloader] External models:', this.externalModels);
      const allModels = [...localModels, ...this.externalModels];
      console.log('[ModelDownloader] Returning all models:', allModels);
      
      return allModels;
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
      
      // Get just the filename from the path
      const filename = path.split('/').pop() || path;
      console.log('[ModelDownloader] Filename to delete:', filename);
      
      // For Android, try multiple possible paths
      if (Platform.OS === 'android') {
        // First try with just the filename (FileSystemModule prepends app's files directory)
        let fileInfo = await FileSystemModule.getInfoAsync(filename, { size: false });
        console.log('[ModelDownloader] Checking path (filename only):', filename, fileInfo);
        
        if (fileInfo.exists) {
          await FileSystemModule.deleteAsync(filename, { idempotent: true });
          console.log('[ModelDownloader] Successfully deleted model file:', filename);
        } else {
          // Try with the full path in the models directory
          const fullPath = `${this.baseDir}/${filename}`;
          fileInfo = await FileSystemModule.getInfoAsync(fullPath, { size: false });
          console.log('[ModelDownloader] Checking path (full path):', fullPath, fileInfo);
          
          if (fileInfo.exists) {
            await FileSystemModule.deleteAsync(fullPath, { idempotent: true });
            console.log('[ModelDownloader] Successfully deleted model file using full path:', fullPath);
          } else {
            // Try with the original path
            fileInfo = await FileSystemModule.getInfoAsync(path, { size: false });
            console.log('[ModelDownloader] Checking path (original path):', path, fileInfo);
            
            if (fileInfo.exists) {
              await FileSystemModule.deleteAsync(path, { idempotent: true });
              console.log('[ModelDownloader] Successfully deleted model file using original path:', path);
            } else {
              console.log('[ModelDownloader] Model file not found at any path');
              throw new Error('Model file not found');
            }
          }
        }
      } else {
        // For other platforms, use the original path
        const fileInfo = await FileSystemModule.getInfoAsync(path, { size: false });
        console.log('[ModelDownloader] Checking path:', path, fileInfo);
        
        if (fileInfo.exists) {
          await FileSystemModule.deleteAsync(path, { idempotent: true });
          console.log('[ModelDownloader] Successfully deleted model file:', path);
        } else {
          console.log('[ModelDownloader] Model file not found');
          throw new Error('Model file not found');
        }
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
      const tempFiles = await FileSystemModule.readDirectoryAsync(this.downloadDir);
      console.log('Files in temp directory:', tempFiles);
      
      // First, check all files in temp directory regardless of active downloads
      for (const filename of tempFiles) {
        const tempPath = `${this.downloadDir}/${filename}`;
        const modelPath = `${this.baseDir}/${filename}`;
        
        // Check if file exists in temp
          const tempInfo = await FileSystemModule.getInfoAsync(tempPath, { size: false });
          if (tempInfo.exists) {
            const tempSize = await this.getFileSize(tempPath);
            
          // If file has size > 0, consider it complete and try to move it
          if (tempSize > 0) {
              try {
              // Check if it's already in models directory
              const modelExists = (await FileSystemModule.getInfoAsync(modelPath, { size: false })).exists;
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
                  filename,
                  downloadId,
                  100
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
        const modelExists = (await FileSystemModule.getInfoAsync(modelPath, { size: false })).exists;
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
      const tempDirInfo = await FileSystemModule.getInfoAsync(this.downloadDir, { size: false });
      if (!tempDirInfo.exists) {
        console.log('[ModelDownloader] Temp directory does not exist, nothing to clean up');
        return;
      }
      
      // Get list of files in temp directory
      const downloadDirContents = await FileSystemModule.readDirectoryAsync(this.downloadDir);
      console.log(`[ModelDownloader] Found ${downloadDirContents.length} files in temp directory:`, downloadDirContents);
      
      // Check each file
      for (const filename of downloadDirContents) {
        const sourcePath = `${this.downloadDir}/${filename}`;
        const destPath = `${this.baseDir}/${filename}`;
        
        // Check if file already exists in models directory
        const destInfo = await FileSystemModule.getInfoAsync(destPath, { size: false });
        if (destInfo.exists) {
          console.log(`[ModelDownloader] File ${filename} already exists in models directory, removing from temp`);
          try {
            await FileSystemModule.deleteAsync(sourcePath, { idempotent: true });
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
        const sourceInfo = await FileSystemModule.getInfoAsync(sourcePath, { size: true });
        if (sourceInfo.exists && (sourceInfo as any).size > 0) {
          console.log(`[ModelDownloader] Found completed download in temp: ${filename}, moving to models directory`);
          try {
            // Make sure models directory exists
            await FileSystemModule.makeDirectoryAsync(this.baseDir, { intermediates: true }).catch(() => {});
            
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
      const modelDirContents = await FileSystemModule.readDirectoryAsync(this.baseDir);
      
      for (const filename of modelDirContents) {
        if (!storedModelNames.includes(filename)) {
          console.log(`[ModelDownloader] Found new model in directory: ${filename}`);
          
          const filePath = `${this.baseDir}/${filename}`;
          const fileInfo = await FileSystemModule.getInfoAsync(filePath, { size: true });
          
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
      // Check if temp directory exists
      const tempDirInfo = await FileSystemModule.getInfoAsync(this.downloadDir, { size: false });
      if (!tempDirInfo.exists) {
        console.log('[ModelDownloader] Temp directory does not exist, creating it');
        await FileSystemModule.makeDirectoryAsync(this.downloadDir, { intermediates: true });
        return;
      }
      
      // Get list of files in temp directory
      const files = await FileSystemModule.readDirectoryAsync(this.downloadDir);
      console.log(`[ModelDownloader] Found ${files.length} files in temp directory`);
      
      // Process each file
      for (const filename of files) {
        // Skip hidden files
        if (filename.startsWith('.')) continue;
        
        const tempPath = `${this.downloadDir}/${filename}`;
        const modelPath = `${this.baseDir}/${filename}`;
        
        // Check if file exists in temp directory
        const tempInfo = await FileSystemModule.getInfoAsync(tempPath, { size: true });
        
        if (tempInfo.exists && (tempInfo as any).size && (tempInfo as any).size > 0) {
          console.log(`[ModelDownloader] Found potentially completed download in temp: ${filename} (${(tempInfo as any).size} bytes)`);
          
          try {
            // Move the file to models directory
            console.log(`[ModelDownloader] Moving ${filename} from ${tempPath} to ${modelPath}`);
            await this.moveFile(tempPath, modelPath);
            console.log(`[ModelDownloader] Successfully moved ${filename} from temp to models directory`);
            
            // Verify the file was moved successfully
            const modelInfo = await FileSystemModule.getInfoAsync(modelPath, { size: true });
            if (!modelInfo.exists) {
              throw new Error(`File was not moved successfully to ${modelPath}`);
            }
            
            // Generate download ID for this model
            const downloadId = this.nextDownloadId++;
            await AsyncStorage.setItem('next_download_id', this.nextDownloadId.toString());
            
            // Store notification for failed download
            if (Platform.OS === 'android') {
              await this.cancelNotification(downloadId);
            } else {
              await this.storeNotification(
                'Download Failed',
                `${filename} download has failed`,
                'download_failed',
                downloadId
              );
            }
          } catch (error) {
            console.error(`[ModelDownloader] Error processing completed download for ${filename}:`, error);
          }
        } else {
          console.log(`[ModelDownloader] File ${filename} in temp directory is empty or invalid`);
        }
      }
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
      const destInfo = await FileSystemModule.getInfoAsync(destPath, { size: false });
      if (destInfo.exists) {
        throw new Error('A model with this name already exists in the models directory');
      }

      // Check if file with same name already exists in external models
      const existingExternal = this.externalModels.find(model => model.name === fileName);
      if (existingExternal) {
        throw new Error('A model with this name already exists in external models');
      }

      // Get the file info to verify it exists and get its size
      const fileInfo = await FileSystemModule.getInfoAsync(uri, { size: true });
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
          const dirInfo = await FileSystemModule.getInfoAsync(this.baseDir, { size: false });
          if (!dirInfo.exists) {
            await FileSystemModule.makeDirectoryAsync(this.baseDir, { intermediates: true });
          }
          
          // Copy the file to our app's directory
          await FileSystemModule.copyAsync({
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

  private async saveDownloadProgress(modelName: string, progress: any) {
    try {
      const savedProgress = await AsyncStorage.getItem(this.DOWNLOAD_PROGRESS_KEY);
      const progressData = savedProgress ? JSON.parse(savedProgress) : {};
      
      progressData[modelName] = progress;
      
      await AsyncStorage.setItem(this.DOWNLOAD_PROGRESS_KEY, JSON.stringify(progressData));
    } catch (error) {
      console.error('[ModelDownloader] Error saving download progress:', error);
    }
  }

  private async loadDownloadProgress() {
    try {
      const savedProgress = await AsyncStorage.getItem(this.DOWNLOAD_PROGRESS_KEY);
      if (savedProgress) {
        const progressData = JSON.parse(savedProgress);
        
        // Emit progress events for each saved download
        Object.entries(progressData).forEach(([modelName, progress]) => {
          if (typeof progress === 'object' && progress !== null) {
            const progressObj = progress as {
              progress: number;
              bytesDownloaded: number;
              totalBytes: number;
              status: string;
              downloadId: number;
            };
            
          this.emit('downloadProgress', {
            modelName,
              progress: progressObj.progress || 0,
              bytesDownloaded: progressObj.bytesDownloaded || 0,
              totalBytes: progressObj.totalBytes || 0,
              status: progressObj.status || 'downloading',
              downloadId: progressObj.downloadId || 0
            });
          }
        });
      }
    } catch (error) {
      console.error('[ModelDownloader] Error loading download progress:', error);
    }
  }

  private async clearDownloadProgress(modelName: string) {
    try {
      const savedProgress = await AsyncStorage.getItem(this.DOWNLOAD_PROGRESS_KEY);
      if (savedProgress) {
        const progressData = JSON.parse(savedProgress);
        delete progressData[modelName];
        await AsyncStorage.setItem(this.DOWNLOAD_PROGRESS_KEY, JSON.stringify(progressData));
      }
    } catch (error) {
      console.error('[ModelDownloader] Error clearing download progress:', error);
    }
  }

  async getModelsDirectory(): Promise<string> {
    return this.baseDir;
  }

  async checkFileExists(path: string): Promise<boolean> {
    try {
      const fileInfo = await FileSystemModule.getInfoAsync(path, { size: false });
      return fileInfo.exists;
    } catch (error) {
      console.error(`[ModelDownloader] Error checking if file exists at ${path}:`, error);
      return false;
    }
  }
}

export const modelDownloader = new ModelDownloader(); 

// Test function to verify native module
export const testNativeDownloader = async () => {
  try {
    console.log('Testing native downloader...');
    // Test with a small file
    const testUrl = 'https://speed.hetzner.de/100MB.bin';
    const testFileName = 'test.bin';
    
    // Create event emitter instance
    const nativeEventEmitter = new NativeEventEmitter(NativeModules.ModelDownloaderModule);
    
    // Set up event listeners
    const progressListener = nativeEventEmitter.addListener(
      'downloadProgress',
      (event: DownloadProgressEvent) => {
        console.log('Download progress:', event);
      }
    );
    
    const errorListener = nativeEventEmitter.addListener(
      'downloadError',
      (event: DownloadErrorEvent) => {
        console.log('Download error:', event);
      }
    );
    
    const result = await ModelDownloaderModule.downloadModel(testUrl, testFileName);
    console.log('Download started with ID:', result.downloadId);
    
    return result.downloadId;
  } catch (error) {
    console.error('Error testing native downloader:', error);
    throw error;
  }
}; 