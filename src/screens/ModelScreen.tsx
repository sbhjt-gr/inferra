import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text as RNText,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Animated,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import { useTheme } from '../context/ThemeContext';
import { useRemoteModel } from '../context/RemoteModelContext';
import { theme } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
import CustomUrlDialog from '../components/CustomUrlDialog';
import { modelDownloader } from '../services/ModelDownloader';
import { useDownloads } from '../context/DownloadContext';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as DocumentPicker from 'expo-document-picker';
import { downloadNotificationService } from '../services/DownloadNotificationService';
import { getThemeAwareColor } from '../utils/ColorUtils';
import { onlineModelService } from '../services/OnlineModelService';
import ApiKeySection from '../components/model/ApiKeySection';
import { FilterOptions } from '../components/ModelFilter';
import UnifiedModelList from '../components/model/UnifiedModelList';
import { DownloadableModel } from '../components/model/DownloadableModelItem';
import ModelDownloadsDialog from '../components/model/ModelDownloadsDialog';
import StoredModelItem from '../components/model/StoredModelItem';
import { getActiveDownloadsCount } from '../utils/ModelUtils';
import { StoredModel } from '../services/ModelDownloaderTypes';
import { DOWNLOADABLE_MODELS } from '../constants/DownloadableModels';
import { Dialog, Portal, Button, Text as PaperText } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logoutUser, getUserFromSecureStorage } from '../services/FirebaseService';
import { modelSettingsService } from '../services/ModelSettingsService';
import { useStoredModels } from '../hooks/useStoredModels';

interface StorageWarningDialogProps {
  visible: boolean;
  onAccept: (dontShowAgain: boolean) => void;
  onCancel: () => void;
}

const StorageWarningDialog: React.FC<StorageWarningDialogProps> = ({
  visible,
  onAccept,
  onCancel
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <Portal>
      <Dialog 
        visible={visible} 
        onDismiss={onCancel}
        style={{
          zIndex: 10000,
          elevation: 10000
        }}
      >
        <Dialog.Title>File Manager Warning</Dialog.Title>
        <Dialog.Content>
          <PaperText variant="bodyMedium" style={{ marginBottom: 16 }}>
            Large model files may cause the file manager to become temporarily stuck on some devices. Please be patient and wait for the file manager to respond once you click on a file.
          </PaperText>
          
          <TouchableOpacity 
            style={styles.checkboxContainer}
            onPress={() => setDontShowAgain(!dontShowAgain)}
          >
            <View style={[
              styles.checkboxSquare,
              { 
                borderColor: getThemeAwareColor('#4a0660', currentTheme),
                backgroundColor: dontShowAgain ? getThemeAwareColor('#4a0660', currentTheme) : 'transparent'
              }
            ]}>
              {dontShowAgain && (
                <MaterialCommunityIcons 
                  name="check" 
                  size={16} 
                  color="white" 
                />
              )}
            </View>
            <PaperText style={[styles.checkboxText, { color: themeColors.text }]}>
              Don't show again
            </PaperText>
          </TouchableOpacity>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel}>Cancel</Button>
          <Button onPress={() => onAccept(dontShowAgain)}>Continue</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

type ModelScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'ModelTab'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

const BACKGROUND_DOWNLOAD_TASK = 'background-download-task';

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

export default function ModelScreen({ navigation }: ModelScreenProps) {
  const { theme: currentTheme } = useTheme();
  const { enableRemoteModels, isLoggedIn, checkLoginStatus } = useRemoteModel();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [activeTab, setActiveTab] = useState<'stored' | 'downloadable' | 'remote'>('stored');
  const { storedModels, isLoading: isLoadingStoredModels, isRefreshing: isRefreshingStoredModels, refreshStoredModels } = useStoredModels();
  const { downloadProgress, setDownloadProgress } = useDownloads();
  const [customUrlDialogVisible, setCustomUrlDialogVisible] = useState(false);
  const [isDownloadsVisible, setIsDownloadsVisible] = useState(false);
  const buttonScale = useRef(new Animated.Value(1)).current;
  const [isLoading, setIsLoading] = useState(false);
  const [importingModelName, setImportingModelName] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openAIApiKey, setOpenAIApiKey] = useState('');
  const [deepSeekApiKey, setDeepSeekApiKey] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogActions, setDialogActions] = useState<React.ReactNode[]>([]);

  const [username, setUsername] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterOptions>({
    tags: [],
    modelFamilies: [],
    quantizations: [],
  });
  const [filteredModels, setFilteredModels] = useState<DownloadableModel[]>([]);
  const [guidanceDialogVisible, setGuidanceDialogVisible] = useState(false);
  const [showStorageWarningDialog, setShowStorageWarningDialog] = useState(false);
  
  const isInitializedRef = useRef(false);

  const hideDialog = () => setDialogVisible(false);

  const showDialog = (title: string, message: string, actions: React.ReactNode[]) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogActions(actions);
    setDialogVisible(true);
  };

  const applyFilters = useCallback((newFilters: FilterOptions) => {
    setFilters(newFilters);
    
    let filtered = [...DOWNLOADABLE_MODELS];
    
    if (newFilters.tags.length > 0) {
      filtered = filtered.filter(model => 
        model.tags && model.tags.some(tag => newFilters.tags.includes(tag))
      );
    }
    
    if (newFilters.modelFamilies.length > 0) {
      filtered = filtered.filter(model => 
        newFilters.modelFamilies.includes(model.modelFamily)
      );
    }
    
    if (newFilters.quantizations.length > 0) {
      filtered = filtered.filter(model => 
        newFilters.quantizations.includes(model.quantization)
      );
    }
    
    setFilteredModels(filtered);
  }, []);

  useEffect(() => {
    setFilteredModels(DOWNLOADABLE_MODELS);
  }, []);

  const getAvailableFilterOptions = () => {
    const allTags = [...new Set(DOWNLOADABLE_MODELS.flatMap(model => model.tags || []))];
    const allModelFamilies = [...new Set(DOWNLOADABLE_MODELS.map(model => model.modelFamily))];
    const allQuantizations = [...new Set(DOWNLOADABLE_MODELS.map(model => model.quantization))];
    
    return {
      tags: allTags,
      modelFamilies: allModelFamilies,
      quantizations: allQuantizations,
    };
  };

  useEffect(() => {
    checkLoginStatusAndUpdateUsername();
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('screen_focus');
      refreshStoredModels();
    }, [refreshStoredModels])
  );

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

  const handleLogout = async () => {
    try {
      const result = await logoutUser();
      
      await AsyncStorage.removeItem('user');
      
      setUsername(null);
      
      await checkLoginStatus();
      
      if (activeTab === 'remote') {
        setActiveTab('stored');
      }
      
      if (result.success) {
        showDialog(
          'Logged Out',
          'You have been successfully logged out.',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
      } else {
        showDialog(
          'Logout Issue',
          result.error || 'There was an issue logging out. Please try again.',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
      }
    } catch (error) {
      showDialog(
        'Error',
        'Failed to log out. Please try again.',
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
    }
  };

  const handleStorageWarningAccept = async (dontShowAgain: boolean) => {
    if (dontShowAgain) {
      try {
        await AsyncStorage.setItem('hideStorageWarning', 'true');
      } catch (error) {
        
      }
    }
    
    setShowStorageWarningDialog(false);
    await proceedWithModelImport();
  };

  const handleStorageWarningCancel = () => {
    setShowStorageWarningDialog(false);
  };

  const handleLinkModel = async () => {
    try {
      const hideWarning = await AsyncStorage.getItem('hideStorageWarning');
      
      if (hideWarning !== 'true') {
        setShowStorageWarningDialog(true);
        return;
      }
      
      await proceedWithModelImport();
    } catch (error) {
      setShowStorageWarningDialog(true);
    }
  };

  const proceedWithModelImport = async () => {
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
        showDialog(
          'Invalid File',
          'Please select a valid GGUF model file (with .gguf extension)',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        return;
      }

      setIsLoading(true);
      setImportingModelName(file.name);
      
      try {
        await modelDownloader.linkExternalModel(file.uri, file.name);
        setIsLoading(false);
        setImportingModelName(null);
        showDialog(
          'Model Imported',
          'The model has been successfully imported to the app.',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        await refreshStoredModels();
      } catch (error) {
        setIsLoading(false);
        setImportingModelName(null);
        showDialog(
          'Error',
          `Failed to import the model: ${error instanceof Error ? error.message : 'Unknown error'}`,
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
      }
    } catch (error) {
      setIsLoading(false);
      showDialog(
        'Error',
        'Could not open the file picker. Please ensure the app has storage permissions.',
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
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
    
    setCustomUrlDialogVisible(false);
  };

  const cancelDownload = async (modelName: string) => {
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
      showDialog('Error', 'Failed to cancel download', [
        <Button key="ok" onPress={hideDialog}>OK</Button>
      ]);
    }
  };

  const loadApiKeys = async () => {
    setIsLoadingApiKeys(true);
    try {
      const geminiKey = await onlineModelService.getApiKey('gemini');
      setGeminiApiKey(geminiKey || '');
      
      const openAIKey = await onlineModelService.getApiKey('chatgpt');
      setOpenAIApiKey(openAIKey || '');
      
      const deepSeekKey = await onlineModelService.getApiKey('deepseek');
      setDeepSeekApiKey(deepSeekKey || '');
      
      const claudeKey = await onlineModelService.getApiKey('claude');
      setClaudeApiKey(claudeKey || '');
    } catch (error) {
    } finally {
      setIsLoadingApiKeys(false);
    }
  };

  useEffect(() => {
    const handleProgress = async ({ modelName, ...progress }: { 
      modelName: string;
      progress: number;
      bytesDownloaded: number;
      totalBytes: number;
      status: string;
      downloadId: number;
      error?: string;
    }) => {
      const filename = modelName.split('/').pop() || modelName;
      
      
      const bytesDownloaded = typeof progress.bytesDownloaded === 'number' ? progress.bytesDownloaded : 0;
      const totalBytes = typeof progress.totalBytes === 'number' ? progress.totalBytes : 0;
      const progressValue = typeof progress.progress === 'number' ? progress.progress : 0;

      if (progress.status === 'completed') {
        await downloadNotificationService.showNotification(
          filename,
          progress.downloadId,
          100,
          bytesDownloaded,
          totalBytes
        );
        
        setDownloadProgress(prev => ({
          ...prev,
          [filename]: {
            progress: 100,
            bytesDownloaded,
            totalBytes,
            status: 'completed',
            downloadId: progress.downloadId
          }
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
        
        await downloadNotificationService.cancelNotification(progress.downloadId);
        
        setDownloadProgress(prev => ({
          ...prev,
          [filename]: {
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            status: 'failed',
            downloadId: progress.downloadId,
            error: progress.error
          }
        }));
        
        setTimeout(() => {
          setDownloadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[filename];
            return newProgress;
          });
        }, 1000);
      } else {
        await downloadNotificationService.updateProgress(
          progress.downloadId,
          progressValue,
          bytesDownloaded,
          totalBytes,
          filename
        );

        setDownloadProgress(prev => ({
          ...prev,
          [filename]: {
            progress: progressValue,
            bytesDownloaded,
            totalBytes,
            status: progress.status,
            downloadId: progress.downloadId
          }
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
        Animated.timing(buttonScale, {
          toValue: 1.2,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(buttonScale, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [downloadProgress]);

  const handleDelete = (model: StoredModel) => {
    showDialog(
      'Delete Model',
      `Are you sure you want to delete ${model.name}?`,
      [
        <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
        <Button
          key="delete"
          onPress={async () => {
            hideDialog();
            try {
              await modelDownloader.deleteModel(model.path);
              await modelSettingsService.deleteModelSettings(model.path);
              await refreshStoredModels();
            } catch (error) {
              showDialog('Error', 'Failed to delete model', [
                <Button key="ok" onPress={hideDialog}>OK</Button>
              ]);
            }
          }}
        >
          Delete
        </Button>
      ]
    );
  };

  const handleExport = async (modelPath: string, modelName: string) => {
    try {
      setIsLoading(true);
      setIsExporting(true);
      
      await modelDownloader.exportModel(modelPath, modelName);
      
      setIsLoading(false);
      setIsExporting(false);
    } catch (error) {
      setIsLoading(false);
      setIsExporting(false);
      showDialog(
        'Share Failed',
        `Failed to share ${modelName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
    }
  };

  const handleModelSettings = (modelPath: string, modelName: string) => {
    navigation.navigate('ModelSettings', {
      modelName,
      modelPath
    });
  };

  const renderDownloadableList = () => (
    <View style={styles.downloadableContainer}>
      <UnifiedModelList
        curatedModels={filteredModels}
        storedModels={storedModels}
        downloadProgress={downloadProgress}
        setDownloadProgress={setDownloadProgress}
        filters={filters}
        onFiltersChange={applyFilters}
        getAvailableFilterOptions={getAvailableFilterOptions}
        onCustomUrlPress={() => setCustomUrlDialogVisible(true)}
        onGuidancePress={() => setGuidanceDialogVisible(true)}
      />

      <CustomUrlDialog
        visible={customUrlDialogVisible}
        onClose={() => setCustomUrlDialogVisible(false)}
        onDownloadStart={handleCustomDownload}
        navigation={navigation}
      />

      <Portal>
        <Dialog visible={guidanceDialogVisible} onDismiss={() => setGuidanceDialogVisible(false)}>
          <Dialog.Title>Model Download Guidance</Dialog.Title>
          <Dialog.Content>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              <PaperText style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
                Unsure what to download?
              </PaperText>
              <PaperText style={{ marginBottom: 16, lineHeight: 20 }}>
                If you don't know what to download first, start with Gemma 3 Instruct - 1B.
              </PaperText>

              <PaperText style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
                Understanding Model Sizes
              </PaperText>
              <PaperText style={{ marginBottom: 16, lineHeight: 20 }}>
                • <PaperText style={{ fontWeight: '600' }}>1B-3B models:</PaperText> Fast and lightweight, great for simple tasks{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>7B-9B models:</PaperText> Good balance of speed and capability{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>13B+ models:</PaperText> More capable but slower, need more memory
              </PaperText>

              <PaperText style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
                Quantization Explained
              </PaperText>
              <PaperText style={{ marginBottom: 12, lineHeight: 20 }}>
                Quantization reduces model size while trying to preserve quality:
              </PaperText>

              <PaperText style={{ fontWeight: '600', marginBottom: 4 }}>Quality Levels (Best to Fastest):</PaperText>
              <PaperText style={{ marginBottom: 12, lineHeight: 18 }}>
                • <PaperText style={{ fontWeight: '600' }}>Q8_0:</PaperText> Highest quality, largest size{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>Q6_K:</PaperText> Very good quality{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>Q5_K_M:</PaperText> Good balance{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>Q4_K_M:</PaperText> Decent quality, smaller size{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>Q3_K_M:</PaperText> Lower quality but very fast
              </PaperText>

              <PaperText style={{ fontWeight: '600', marginBottom: 4 }}>Advanced Types:</PaperText>
              <PaperText style={{ marginBottom: 12, lineHeight: 18 }}>
                • <PaperText style={{ fontWeight: '600' }}>IQ types:</PaperText> More precise but slower than Q types{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>_XS:</PaperText> Extra small, more compressed{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>_NL:</PaperText> Non-linear, better results with more compute{'\n'}
                • <PaperText style={{ fontWeight: '600' }}>_K types:</PaperText> Mixed precision for better quality
              </PaperText>

            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setGuidanceDialogVisible(false)}>Got it!</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );

  const renderRemoteModelsList = () => (
    <View style={styles.remoteModelsContainer}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <RNText style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 16 }]}>
          API Settings for Remote Models
        </RNText>
        <ApiKeySection />

        <View style={{ height: 20 }} />

      </ScrollView>
    </View>
  );

  const StoredModelsHeader = () => (
    <View style={styles.storedModelsHeader}>
      <View style={styles.storedHeaderActions}>
        <RNText style={[styles.storedHeaderTitle, { color: themeColors.text }]}>Stored Models</RNText>
        <TouchableOpacity
          style={[styles.refreshButton, { backgroundColor: themeColors.borderColor }]}
          onPress={refreshStoredModels}
          disabled={isRefreshingStoredModels}
        >
          {isRefreshingStoredModels ? (
            <ActivityIndicator size="small" color={getThemeAwareColor('#4a0660', currentTheme)} />
          ) : (
            <MaterialCommunityIcons name="refresh" size={20} color={themeColors.text} />
          )}
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.customUrlButton, { backgroundColor: themeColors.borderColor }]}
        onPress={handleLinkModel}
      >
        <View style={styles.customUrlButtonContent}>
          <View style={styles.customUrlIconContainer}>
            <MaterialCommunityIcons name="link" size={24} color={getThemeAwareColor('#4a0660', currentTheme)} />
          </View>
          <View style={styles.customUrlTextContainer}>
            <RNText style={[styles.customUrlButtonTitle, { color: themeColors.text }] }>
              Import Model
            </RNText>
            <RNText style={[styles.customUrlButtonSubtitle, { color: themeColors.secondaryText }] }>
              Import a GGUF model from the storage
            </RNText>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderItem = ({ item }: { item: StoredModel }) => {
    const isProjectorModel = item.name.toLowerCase().includes('mmproj') ||
                            item.name.toLowerCase().includes('.proj');
    
    return (
      <StoredModelItem
        id={item.path}
        name={item.name}
        path={item.path}
        size={item.size}
        isProjector={isProjectorModel}
        onDelete={() => handleDelete(item)}
        onExport={handleExport}
        onSettings={handleModelSettings}
      />
    );
  };

  const renderDownloadsButton = () => {
    const activeCount = getActiveDownloadsCount(downloadProgress);
    if (activeCount === 0) return null;

    return (
      <Animated.View 
        style={[
          styles.floatingButton,
          { transform: [{ scale: buttonScale }] }
        ]}
      >
        <TouchableOpacity
          style={[styles.floatingButtonContent, { backgroundColor: themeColors.primary }]}
          onPress={() => navigation.navigate('Downloads')}
        >
          <MaterialCommunityIcons name="cloud-download" size={24} color={themeColors.headerText} />
          <View style={styles.downloadCount}>
            <RNText style={styles.downloadCountText}>{activeCount}</RNText>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  useEffect(() => {
    const handleDownloadStarted = (data: { modelName: string; message: string }) => {
      
    };

    modelDownloader.on('downloadStarted', handleDownloadStarted);
    
    return () => {
      modelDownloader.off('downloadStarted', handleDownloadStarted);
    };
  }, []);

  useEffect(() => {
    const handleImportProgress = (progress: { 
      modelName: string; 
      status: 'importing' | 'completed' | 'error';
      error?: string;
    }) => {
      
      if (isExporting) {
        return;
      }
      
      if (progress.status === 'importing') {
        setImportingModelName(progress.modelName);
      } else {
        setImportingModelName(null);
        if (progress.status === 'error' && progress.error) {
          showDialog(
            'Error',
            `Failed to import model: ${progress.error}`,
            [<Button key="ok" onPress={hideDialog}>OK</Button>]
          );
        }
      }
    };

    const handleModelExported = (data: { modelName: string; tempFilePath: string }) => {
      showDialog(
        'Share Successful',
        `${data.modelName} has been successfully prepared for sharing. You can now save it to your desired location.`,
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
    };

    modelDownloader.on('importProgress', handleImportProgress);
    modelDownloader.on('modelExported', handleModelExported);

    return () => {
      modelDownloader.off('importProgress', handleImportProgress);
      modelDownloader.off('modelExported', handleModelExported);
    };
  }, [isExporting, showDialog, hideDialog]);

  useEffect(() => {
    loadApiKeys();
  }, []);

  const handleTabPress = (tab: 'stored' | 'downloadable' | 'remote') => {
    if (tab === 'remote') {
      if (!isLoggedIn || !enableRemoteModels) {
        showDialog(
          'Remote Models Disabled',
          'Remote models require the "Enable Remote Models" setting to be turned on and you need to be signed in. Would you like to go to Settings to configure this?',
          [
            <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
            <Button 
              key="settings" 
              onPress={() => {
                hideDialog();
                if (!isLoggedIn) {
                  navigation.navigate('Login', {
                    redirectTo: 'MainTabs',
                    redirectParams: { screen: 'ModelTab' }
                  });
                } else {
                  navigation.navigate('MainTabs', { screen: 'SettingsTab' });
                }
              }}
            >
              {!isLoggedIn ? "Sign In" : "Go to Settings"}
            </Button>
          ]
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

  const ProfileButton = () => {
    return (
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => {
          if (isLoggedIn) {
            navigation.navigate('Profile');
          } else {
            navigation.navigate('Login', {
              redirectTo: 'MainTabs',
              redirectParams: { screen: 'ModelTab' }
            });
          }
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MaterialCommunityIcons 
          name={isLoggedIn ? "account-circle" : "login"} 
          size={22} 
          color={theme[currentTheme].headerText} 
        />
      </TouchableOpacity>
    );
  };
  
  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <AppHeader 
        title="Models" 
        rightButtons={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ProfileButton />
          </View>
        }
      />
      <View style={styles.content}>
        <View style={styles.tabContainer}>
          <View style={[styles.segmentedControl, { backgroundColor: themeColors.borderColor }]}>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                { borderColor: themeColors.primary },
                activeTab === 'stored' && styles.activeSegment,
                activeTab === 'stored' && { backgroundColor: themeColors.primary }
              ]}
              onPress={() => handleTabPress('stored')}
            >
              <MaterialCommunityIcons 
                name="folder" 
                size={18} 
                color={activeTab === 'stored' ? '#fff' : themeColors.text} 
                style={styles.segmentIcon}
              />
              <RNText style={[
                styles.segmentText,
                { color: activeTab === 'stored' ? '#fff' : themeColors.text }
              ]}>
                Stored Models
              </RNText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                { borderColor: themeColors.primary },
                activeTab === 'downloadable' && styles.activeSegment,
                activeTab === 'downloadable' && { backgroundColor: themeColors.primary }
              ]}
              onPress={() => handleTabPress('downloadable')}
            >
              <MaterialCommunityIcons 
                name="cloud-download" 
                size={18} 
                color={activeTab === 'downloadable' ? '#fff' : themeColors.text}
                style={styles.segmentIcon}
              />
              <RNText style={[
                styles.segmentText,
                { color: activeTab === 'downloadable' ? '#fff' : themeColors.text }
              ]}>
                Download Models
              </RNText>
            </TouchableOpacity>
            {enableRemoteModels && (
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  { borderColor: themeColors.primary },
                  activeTab === 'remote' && styles.activeSegment,
                  activeTab === 'remote' && { backgroundColor: themeColors.primary }
                ]}
                onPress={() => handleTabPress('remote')}
              >
                <MaterialCommunityIcons 
                  name="cloud" 
                  size={18} 
                  color={activeTab === 'remote' ? '#fff' : themeColors.text}
                  style={styles.segmentIcon}
                />
                <RNText style={[
                  styles.segmentText,
                  { color: activeTab === 'remote' ? '#fff' : themeColors.text }
                ]}>
                  Remote Models
                </RNText>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.contentContainer}>
          {activeTab === 'stored' ? (
            <FlatList
              data={storedModels}
              renderItem={renderItem}
              keyExtractor={item => item.path}
              contentContainerStyle={styles.list}
              ListHeaderComponent={StoredModelsHeader}
              ListEmptyComponent={
                isLoadingStoredModels ? (
                  <View style={styles.emptyContainer}>
                    <ActivityIndicator size="large" color={getThemeAwareColor('#4a0660', currentTheme)} />
                    <RNText style={[styles.emptyText, { color: themeColors.secondaryText, marginTop: 16 }]}>
                      Loading models...
                    </RNText>
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons 
                      name="folder-open" 
                      size={48} 
                      color={themeColors.secondaryText}
                    />
                    <RNText style={[styles.emptyText, { color: themeColors.secondaryText }]}>
                      No models downloaded yet. Go to the "Download Models" tab to get started.
                    </RNText>
                  </View>
                )
              }
            />
          ) : activeTab === 'downloadable' ? (
            renderDownloadableList()
          ) : (
            renderRemoteModelsList()
          )}
        </View>
      </View>
      
      <ModelDownloadsDialog
        visible={isDownloadsVisible}
        onClose={() => setIsDownloadsVisible(false)}
        downloads={downloadProgress}
        onCancelDownload={cancelDownload}
      />

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={hideDialog}>
          <Dialog.Title>{dialogTitle}</Dialog.Title>
          <Dialog.Content>
            <PaperText>{dialogMessage}</PaperText>
          </Dialog.Content>
          <Dialog.Actions>
            {dialogActions.map((ActionComponent, index) =>
              React.isValidElement(ActionComponent) ? React.cloneElement(ActionComponent, { key: index }) : null
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {(isLoading || importingModelName) && (
        <View style={styles.loadingOverlay}>
          <View style={[styles.loadingContainer, { backgroundColor: themeColors.borderColor }]}>
            <ActivityIndicator size="large" color={themeColors.primary} />
            <RNText style={[styles.loadingText, { color: themeColors.text, textAlign: 'center' }]}>
              {isExporting ? 'Exporting model...' : (importingModelName ? `Importing ${importingModelName}...` : 'Importing model...')}
            </RNText>
            <RNText style={[styles.loadingSubtext, { color: themeColors.secondaryText, textAlign: 'center' }]}>
              {isExporting ? 'Preparing model for sharing' : (importingModelName ? 'Moving model to app storage' : 'This may take a while for large models')}
            </RNText>
          </View>
        </View>
      )}

      {renderDownloadsButton()}

      <StorageWarningDialog
        visible={showStorageWarningDialog}
        onAccept={handleStorageWarningAccept}
        onCancel={handleStorageWarningCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  tabContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    marginTop: 8,
  },
  storedHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  storedHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSegment: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  segmentIcon: {
    marginRight: 6,
  },
  contentContainer: {
    flex: 1,
    paddingTop: 8,
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    marginTop: 8,
  },
  customUrlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  customUrlButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customUrlIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  customUrlTextContainer: {
    flex: 1,
  },
  customUrlButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  customUrlButtonSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  downloadableContainer: {
    flex: 1,
  },
  remoteModelsContainer: {
    flex: 1,
  },
  remoteModelsInfo: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  storedModelsHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  floatingButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4a0660',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  downloadCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ff4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  downloadCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  floatingButtonContent: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingContainer: {
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    width: '80%',
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  guidanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  guidanceButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  guidanceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 6,
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderRadius: 3,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxText: {
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
}); 
