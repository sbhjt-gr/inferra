import { useState, useEffect, useRef, useCallback } from 'react';
import { Animated, AppState, AppStateStatus, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDownloads } from '../context/DownloadContext';
import { useRemoteModel } from '../context/RemoteModelContext';
import { useStoredModels } from './useStoredModels';
import { modelDownloader } from '../services/ModelDownloader';
import { downloadNotificationService } from '../services/DownloadNotificationService';
import { onlineModelService } from '../services/OnlineModelService';
import { modelSettingsService } from '../services/ModelSettingsService';
import { getUserFromSecureStorage, logoutUser } from '../services/FirebaseService';
import { getActiveDownloadsCount } from '../utils/ModelUtils';
import { StoredModel } from '../services/ModelDownloaderTypes';

const BACKGROUND_DOWNLOAD_TASK = 'background-download-task';
const isAndroid = Platform.OS === 'android';

TaskManager.defineTask(BACKGROUND_DOWNLOAD_TASK, async ({ data, error }) => {
  if (error) {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
  return BackgroundTask.BackgroundTaskResult.Success;
});

const registerBackgroundTask = async () => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_DOWNLOAD_TASK);
    if (isRegistered) {
      return;
    }
    await BackgroundTask.registerTaskAsync(BACKGROUND_DOWNLOAD_TASK, {
      minimumInterval: 15
    });
  } catch (err) {
  }
};

export const useModelScreenLogic = (navigation: any) => {
  const { enableRemoteModels, isLoggedIn, checkLoginStatus } = useRemoteModel();
  const { storedModels, isLoading: isLoadingStoredModels, isRefreshing: isRefreshingStoredModels, refreshStoredModels } = useStoredModels();
  const { downloadProgress, setDownloadProgress } = useDownloads();
  
  const [activeTab, setActiveTab] = useState<'stored' | 'downloadable' | 'remote'>('stored');
  const [isDownloadsVisible, setIsDownloadsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [importingModelName, setImportingModelName] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showStorageWarningDialog, setShowStorageWarningDialog] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  
  const buttonScale = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      refreshStoredModels();
    }, [refreshStoredModels])
  );

  useEffect(() => {
    checkLoginStatusAndUpdateUsername();
  }, []);

  const checkLoginStatusAndUpdateUsername = async () => {
    try {
      const userData = await getUserFromSecureStorage();
      if (userData) {
        setUsername(userData.email || userData.displayName);
        return;
      }
      
      const userJson = await AsyncStorage.getItem('user');
      if (userJson) {
        const user = JSON.parse(userJson);
        setUsername(user.email);
      }
    } catch (error) {
    }
  };

  const handleLogout = async (showDialog: (title: string, message: string, actions: any[]) => void, hideDialog: () => void) => {
    try {
      const result = await logoutUser();
      await AsyncStorage.removeItem('user');
      setUsername(null);
      await checkLoginStatus();
      
      if (activeTab === 'remote') {
        setActiveTab('stored');
      }
      
      if (result.success) {
        showDialog('Logged Out', 'You have been successfully logged out.', []);
      } else {
        showDialog('Logout Issue', result.error || 'There was an issue logging out. Please try again.', []);
      }
    } catch (error) {
      showDialog('Error', 'Failed to log out. Please try again.', []);
    }
  };

  const handleStorageWarningAccept = async (dontShowAgain: boolean, proceedWithImport: () => Promise<void>) => {
    if (dontShowAgain) {
      try {
        await AsyncStorage.setItem('hideStorageWarning', 'true');
      } catch (error) {
      }
    }
    setShowStorageWarningDialog(false);
    await proceedWithImport();
  };

  const handleLinkModel = async (proceedWithImport: () => Promise<void>) => {
    try {
      const hideWarning = await AsyncStorage.getItem('hideStorageWarning');
      if (hideWarning !== 'true') {
        setShowStorageWarningDialog(true);
        return;
      }
      await proceedWithImport();
    } catch (error) {
      setShowStorageWarningDialog(true);
    }
  };

  const proceedWithModelImport = async (showDialog: (title: string, message: string, actions: any[]) => void) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: false,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      const fileName = file.name.toLowerCase();

      if (!fileName.endsWith('.gguf')) {
        showDialog('Invalid File', 'Please select a valid GGUF model file (with .gguf extension)', []);
        return;
      }

      setIsLoading(true);
      setImportingModelName(file.name);
      
      try {
        await modelDownloader.linkExternalModel(file.uri, file.name);
        setIsLoading(false);
        setImportingModelName(null);
        showDialog('Model Imported', 'The model has been successfully imported to the app.', []);
        await refreshStoredModels();
      } catch (error) {
        setIsLoading(false);
        setImportingModelName(null);
        showDialog('Error', `Failed to import the model: ${error instanceof Error ? error.message : 'Unknown error'}`, []);
      }
    } catch (error) {
      setIsLoading(false);
      showDialog('Error', 'Could not open the file picker. Please ensure the app has storage permissions.', []);
    }
  };

  const handleCustomDownload = async (downloadId: number, modelName: string) => {
    navigation.navigate('Downloads');
    
    setDownloadProgress(prev => ({
      ...prev,
      [modelName.split('/').pop() || modelName]: {
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'starting',
        downloadId
      }
    }));
  };

  const cancelDownload = async (modelName: string, showDialog: (title: string, message: string, actions: any[]) => void) => {
    try {
      const downloadInfo = downloadProgress[modelName];
      if (!downloadInfo) {
        throw new Error('Download information not found');
      }
      
      await modelDownloader.cancelDownload(modelName);
      
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[modelName];
        return newProgress;
      });
      
      try {
        const savedStates = await AsyncStorage.getItem('active_downloads');
        if (savedStates) {
          const parsedStates = JSON.parse(savedStates);
          if (parsedStates[modelName]) {
            delete parsedStates[modelName];
            if (Object.keys(parsedStates).length > 0) {
              await AsyncStorage.setItem('active_downloads', JSON.stringify(parsedStates));
            } else {
              await AsyncStorage.removeItem('active_downloads');
            }
          }
        }
      } catch (storageError) {
      }

      await refreshStoredModels();
    } catch (error) {
      showDialog('Error', 'Failed to cancel download', []);
    }
  };

  const handleDelete = async (model: StoredModel, showDialog: (title: string, message: string, actions: any[]) => void, hideDialog: () => void) => {
    showDialog(
      'Delete Model',
      `Are you sure you want to delete ${model.name}?`,
      []
    );
  };

  const confirmDelete = async (model: StoredModel, showDialog: (title: string, message: string, actions: any[]) => void) => {
    try {
      await modelDownloader.deleteModel(model.path);
      await modelSettingsService.deleteModelSettings(model.path);
      await refreshStoredModels();
    } catch (error) {
      showDialog('Error', 'Failed to delete model', []);
    }
  };

  const handleExport = async (modelPath: string, modelName: string, showDialog: (title: string, message: string, actions: any[]) => void) => {
    try {
      setIsLoading(true);
      setIsExporting(true);
      await modelDownloader.exportModel(modelPath, modelName);
      setIsLoading(false);
      setIsExporting(false);
    } catch (error) {
      setIsLoading(false);
      setIsExporting(false);
      showDialog('Share Failed', `Failed to share ${modelName}: ${error instanceof Error ? error.message : 'Unknown error'}`, []);
    }
  };

  const handleModelSettings = (modelPath: string, modelName: string) => {
    navigation.navigate('ModelSettings', { modelName, modelPath });
  };

  const handleTabPress = (tab: 'stored' | 'downloadable' | 'remote', showDialog: (title: string, message: string, actions: any[]) => void, hideDialog: () => void) => {
    if (tab === 'remote') {
      if (!isLoggedIn || !enableRemoteModels) {
        showDialog(
          'Remote Models Disabled',
          'Remote models require the "Enable Remote Models" setting to be turned on and you need to be signed in. Would you like to go to Settings to configure this?',
          []
        );
        return;
      }
    }
    setActiveTab(tab);
  };

  useEffect(() => {
    if (!enableRemoteModels && activeTab === 'remote') {
      setActiveTab('stored');
    }
  }, [enableRemoteModels, activeTab]);

  useEffect(() => {
    const handleProgress = async ({ modelName, ...progress }: any) => {
      if (!modelName || modelName.startsWith('com.inferra.transfer.')) {
        return;
      }
      const filename = modelName.split('/').pop() || modelName;
      const bytesDownloaded = typeof progress.bytesDownloaded === 'number' ? progress.bytesDownloaded : 0;
      const totalBytes = typeof progress.totalBytes === 'number' ? progress.totalBytes : 0;
      const progressValue = typeof progress.progress === 'number' ? progress.progress : 0;

      if (progress.status === 'completed') {
        if (!isAndroid) {
          await downloadNotificationService.showNotification(filename, progress.downloadId, 100, bytesDownloaded, totalBytes);
        }
        setDownloadProgress(prev => ({
          ...prev,
          [filename]: { progress: 100, bytesDownloaded, totalBytes, status: 'completed', downloadId: progress.downloadId }
        }));
        await refreshStoredModels();
        setTimeout(() => {
          setDownloadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[filename];
            return newProgress;
          });
        }, 1000);
      } else if (progress.status === 'failed') {
        if (!isAndroid) {
          await downloadNotificationService.cancelNotification(progress.downloadId);
        }
        setDownloadProgress(prev => ({
          ...prev,
          [filename]: { progress: 0, bytesDownloaded: 0, totalBytes: 0, status: 'failed', downloadId: progress.downloadId, error: progress.error }
        }));
        setTimeout(() => {
          setDownloadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[filename];
            return newProgress;
          });
        }, 1000);
      } else {
        if (!isAndroid) {
          await downloadNotificationService.updateProgress(progress.downloadId, progressValue, bytesDownloaded, totalBytes, filename);
        }
        setDownloadProgress(prev => ({
          ...prev,
          [filename]: { progress: progressValue, bytesDownloaded, totalBytes, status: progress.status, downloadId: progress.downloadId }
        }));
      }
    };

    const setupBackgroundTask = async () => {
      await registerBackgroundTask();
    };

    setupBackgroundTask();
    modelDownloader.on('downloadProgress', handleProgress);
    
    return () => {
      modelDownloader.off('downloadProgress', handleProgress);
    };
  }, []);

  useEffect(() => {
    const activeCount = getActiveDownloadsCount(downloadProgress);
    if (activeCount > 0) {
      Animated.sequence([
        Animated.timing(buttonScale, { toValue: 1.2, duration: 200, useNativeDriver: true }),
        Animated.timing(buttonScale, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [downloadProgress]);

  useEffect(() => {
    const handleImportProgress = (progress: { modelName: string; status: 'importing' | 'completed' | 'error'; error?: string }) => {
      if (isExporting) return;
      if (progress.status === 'importing') {
        setImportingModelName(progress.modelName);
      } else {
        setImportingModelName(null);
      }
    };

    modelDownloader.on('importProgress', handleImportProgress);
    return () => {
      modelDownloader.off('importProgress', handleImportProgress);
    };
  }, [isExporting]);

  return {
    activeTab,
    setActiveTab,
    storedModels,
    isLoadingStoredModels,
    isRefreshingStoredModels,
    refreshStoredModels,
    downloadProgress,
    setDownloadProgress,
    isDownloadsVisible,
    setIsDownloadsVisible,
    buttonScale,
    isLoading,
    importingModelName,
    isExporting,
    showStorageWarningDialog,
    setShowStorageWarningDialog,
    username,
    enableRemoteModels,
    isLoggedIn,
    handleLogout,
    handleStorageWarningAccept,
    handleLinkModel,
    proceedWithModelImport,
    handleCustomDownload,
    cancelDownload,
    handleDelete,
    confirmDelete,
    handleExport,
    handleModelSettings,
    handleTabPress,
  };
};
