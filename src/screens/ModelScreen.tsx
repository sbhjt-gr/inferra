import React, { useEffect, useState, useRef } from 'react';
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
} from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
import CustomUrlDialog from '../components/CustomUrlDialog';
import { modelDownloader } from '../services/ModelDownloader';
import { useDownloads } from '../context/DownloadContext';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as DocumentPicker from 'expo-document-picker';
import { downloadNotificationService } from '../services/DownloadNotificationService';
import { getThemeAwareColor } from '../utils/ColorUtils';
import { onlineModelService } from '../services/OnlineModelService';
import DownloadableModelList from '../components/model/DownloadableModelList';
import ApiKeySection from '../components/model/ApiKeySection';
import ModelDownloadsDialog from '../components/model/ModelDownloadsDialog';
import StoredModelItem from '../components/model/StoredModelItem';
import { getActiveDownloadsCount } from '../utils/ModelUtils';
import { StoredModel } from '../services/ModelDownloaderTypes';
import { DOWNLOADABLE_MODELS } from '../constants/DownloadableModels';
import { Dialog, Portal, PaperProvider, Button, Text as PaperText } from 'react-native-paper';

type ModelScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'ModelTab'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

const BACKGROUND_DOWNLOAD_TASK = 'background-download-task';

TaskManager.defineTask(BACKGROUND_DOWNLOAD_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background task error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
  
  return BackgroundFetch.BackgroundFetchResult.NewData;
});

const registerBackgroundTask = async () => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_DOWNLOAD_TASK);
    
    if (isRegistered) {
      console.log('Background download task already registered');
      return;
    }
    
    await BackgroundFetch.registerTaskAsync(BACKGROUND_DOWNLOAD_TASK, {
      minimumInterval: 15,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log('Background download task registered in ModelScreen');
  } catch (err) {
    console.error('Task registration failed in ModelScreen:', err);
  }
};

export default function ModelScreen({ navigation }: ModelScreenProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [activeTab, setActiveTab] = useState<'stored' | 'downloadable'>('stored');
  const [storedModels, setStoredModels] = useState<StoredModel[]>([]);
  const { downloadProgress, setDownloadProgress } = useDownloads();
  const [customUrlDialogVisible, setCustomUrlDialogVisible] = useState(false);
  const [isDownloadsVisible, setIsDownloadsVisible] = useState(false);
  const buttonScale = useRef(new Animated.Value(1)).current;
  const [isLoading, setIsLoading] = useState(false);
  const [importingModelName, setImportingModelName] = useState<string | null>(null);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openAIApiKey, setOpenAIApiKey] = useState('');
  const [deepSeekApiKey, setDeepSeekApiKey] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogActions, setDialogActions] = useState<React.ReactNode[]>([]);

  const hideDialog = () => setDialogVisible(false);

  const showDialog = (title: string, message: string, actions: React.ReactNode[]) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogActions(actions);
    setDialogVisible(true);
  };

  const handleLinkModel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: false,
      });

      if (result.canceled) {
        console.log('[ModelScreen] Document picking canceled');
        return;
      }

      const file = result.assets[0];
      const fileName = file.name.toLowerCase();
      
      console.log('[ModelScreen] Selected file:', {
        name: file.name,
        uri: file.uri,
        type: file.mimeType,
        size: file.size
      });

      if (!fileName.endsWith('.gguf')) {
        showDialog(
          'Invalid File',
          'Please select a valid GGUF model file (with .gguf extension)',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        return;
      }

      setIsLoading(true);
      
      try {
        const isAndroidContentUri = Platform.OS === 'android' && file.uri.startsWith('content://');
        
        if (isAndroidContentUri) {
          Alert.alert(
            'Importing Model',
            'The model file needs to be copied to the app directory to work properly. This may take a while for large models.',
            [
              {
                text: 'Continue',
                onPress: async () => {
                  try {
                    setImportingModelName(file.name);
                    await modelDownloader.linkExternalModel(file.uri, file.name);
                    setIsLoading(false);
                    setImportingModelName(null);
                    showDialog(
                      'Model Imported',
                      'The model has been successfully imported. Consider deleting the original file from your device to save space.',
                      [<Button key="ok" onPress={hideDialog}>OK</Button>]
                    );
                    await loadStoredModels();
                  } catch (error) {
                    setIsLoading(false);
                    setImportingModelName(null);
                    console.error('[ModelScreen] Error importing model:', error);
                    showDialog(
                      'Error',
                      `Failed to import the model: ${error instanceof Error ? error.message : 'Unknown error'}`,
                      [<Button key="ok" onPress={hideDialog}>OK</Button>]
                    );
                  }
                }
              },
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => setIsLoading(false)
              }
            ]
          );
        } else {
          setImportingModelName(file.name);
          await modelDownloader.linkExternalModel(file.uri, file.name);
          setIsLoading(false);
          setImportingModelName(null);
          showDialog(
            'Model Linked',
            'The model has been successfully linked to the app. It will remain in its original location.',
            [<Button key="ok" onPress={hideDialog}>OK</Button>]
          );
          await loadStoredModels();
        }
      } catch (error) {
        setIsLoading(false);
        setImportingModelName(null);
        console.error('[ModelScreen] Error picking document:', error);
        showDialog(
          'Error',
          'Failed to access the file. Please try again or choose a different file.',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
      }
    } catch (error) {
      setIsLoading(false);
      console.error('[ModelScreen] DocumentPicker error:', error);
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
      
      await modelDownloader.cancelDownload(downloadInfo.downloadId);
      
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[modelName];
        return newProgress;
      });
      
      await loadStoredModels();
    } catch (error) {
      console.error('Error canceling download:', error);
      showDialog('Error', 'Failed to cancel download', [
        <Button key="ok" onPress={hideDialog}>OK</Button>
      ]);
    }
  };

  const loadStoredModels = async () => {
    console.log('[ModelScreen] Loading stored models...');
    try {
      try {
        console.log('[ModelScreen] Checking for background downloads...');
        await modelDownloader.checkBackgroundDownloads();
        console.log('[ModelScreen] Background downloads check completed');
      } catch (checkError) {
        console.error('[ModelScreen] Error checking background downloads:', checkError);
      }
      
      console.log('[ModelScreen] Getting stored models from modelDownloader...');
      const models = await modelDownloader.getStoredModels();
      setStoredModels(models);
    } catch (error) {
      console.error('[ModelScreen] Error loading stored models:', error);
      showDialog(
        'Error Loading Models',
        'There was a problem loading your stored models. Please try again.',
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
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
      console.error('Error loading API keys:', error);
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
      
      console.log(`[ModelScreen] Download progress for ${filename}:`, progress.status, progress.progress);
      
      const bytesDownloaded = typeof progress.bytesDownloaded === 'number' ? progress.bytesDownloaded : 0;
      const totalBytes = typeof progress.totalBytes === 'number' ? progress.totalBytes : 0;
      const progressValue = typeof progress.progress === 'number' ? progress.progress : 0;

      if (progress.status === 'completed') {
        console.log(`[ModelScreen] Download completed for ${filename}`);
        
        if (Platform.OS === 'android') {
          await downloadNotificationService.showNotification(
            filename,
            progress.downloadId,
            100
          );
        }
        
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
        
        await loadStoredModels();
        
        setTimeout(() => {
          setDownloadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[filename];
            return newProgress;
          });
        }, 1000);
      } else if (progress.status === 'failed') {
        console.log(`[ModelScreen] Download failed for ${filename}:`, progress.error);
        
        if (Platform.OS === 'android') {
          await downloadNotificationService.cancelNotification(progress.downloadId);
        }
        
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
        if (Platform.OS === 'android') {
          await downloadNotificationService.updateProgress(
            progress.downloadId,
            progressValue
          );
        }

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

    const setupNotifications = async () => {
      if (Platform.OS === 'android') {
        await downloadNotificationService.requestPermissions();
      }
      await registerBackgroundTask();
    };

    loadStoredModels();
    
    modelDownloader.on('downloadProgress', handleProgress);
    
    modelDownloader.on('modelsChanged', loadStoredModels);
    
    setupNotifications();
    
    return () => {
      modelDownloader.off('downloadProgress', handleProgress);
      modelDownloader.off('modelsChanged', loadStoredModels);
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
    console.log(`[ModelScreen] Attempting to delete model: ${model.name}, path: ${model.path}`);
    
    if (model.isExternal) {
      try {
        console.log(`[ModelScreen] Removing linkage for external model: ${model.name}`);
        modelDownloader.deleteModel(model.path);
        loadStoredModels();
      } catch (error) {
        console.error(`[ModelScreen] Error removing linkage for model ${model.name}:`, error);
        showDialog('Error', 'Failed to remove model linkage', [
          <Button key="ok" onPress={hideDialog}>OK</Button>
        ]);
      }
    } else {
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
                console.log(`[ModelScreen] User confirmed deletion of model: ${model.name}`);
                await modelDownloader.deleteModel(model.path);
                console.log(`[ModelScreen] Model deleted, refreshing stored models list`);
                await loadStoredModels();
              } catch (error) {
                console.error(`[ModelScreen] Error deleting model ${model.name}:`, error);
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
    }
  };

  const renderDownloadableList = () => (
    <View style={styles.downloadableContainer}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <ApiKeySection />

        <TouchableOpacity
          style={[styles.customUrlButton, { backgroundColor: themeColors.borderColor }, { marginBottom: 25 }]}
          onPress={() => setCustomUrlDialogVisible(true)}
        >
          <View style={styles.customUrlButtonContent}>
            <View style={styles.customUrlIconContainer}>
              <MaterialCommunityIcons name="plus-circle-outline" size={24} color={getThemeAwareColor('#4a0660', currentTheme)} />
            </View>
            <View style={styles.customUrlTextContainer}>
              <RNText style={[styles.customUrlButtonTitle, { color: themeColors.text }]}>
                Download from URL
              </RNText>
              <RNText style={[styles.customUrlButtonSubtitle, { color: themeColors.secondaryText }]}>
                Download a custom GGUF model from a URL
              </RNText>
            </View>
          </View>
        </TouchableOpacity>
        
        <DownloadableModelList 
          models={DOWNLOADABLE_MODELS}
          storedModels={storedModels}
          downloadProgress={downloadProgress}
          setDownloadProgress={setDownloadProgress}
        />

        <CustomUrlDialog
          visible={customUrlDialogVisible}
          onClose={() => setCustomUrlDialogVisible(false)}
          onDownloadStart={handleCustomDownload}
          navigation={navigation}
        />
      </ScrollView>
    </View>
  );

  const StoredModelsHeader = () => (
    <View style={styles.storedModelsHeader}>
      <TouchableOpacity
        style={[styles.customUrlButton, { backgroundColor: themeColors.borderColor }]}
        onPress={handleLinkModel}
      >
        <View style={styles.customUrlButtonContent}>
          <View style={styles.customUrlIconContainer}>
            <MaterialCommunityIcons name="link" size={24} color={getThemeAwareColor('#4a0660', currentTheme)} />
          </View>
          <View style={styles.customUrlTextContainer}>
            <RNText style={[styles.customUrlButtonTitle, { color: themeColors.text }]}>
              Import Model
            </RNText>
            <RNText style={[styles.customUrlButtonSubtitle, { color: themeColors.secondaryText }]}>
              Import a GGUF model from the storage
            </RNText>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderItem = ({ item }: { item: StoredModel }) => {
    return (
      <StoredModelItem
        id={item.path}
        name={item.name}
        path={item.path}
        size={item.size}
        isExternal={Boolean(item.isExternal)}
        onDelete={() => handleDelete(item)}
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
    const handleImportProgress = (progress: { 
      modelName: string; 
      status: 'importing' | 'completed' | 'error';
      error?: string;
    }) => {
      console.log('[ModelScreen] Import progress:', progress);
      if (progress.status === 'importing') {
        setImportingModelName(progress.modelName);
      } else {
        setImportingModelName(null);
        if (progress.status === 'error' && progress.error) {
          Alert.alert('Error', `Failed to import model: ${progress.error}`);
        }
      }
    };

    modelDownloader.on('importProgress', handleImportProgress);

    return () => {
      modelDownloader.off('importProgress', handleImportProgress);
    };
  }, []);

  useEffect(() => {
    loadApiKeys();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <AppHeader />
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
              onPress={() => setActiveTab('stored')}
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
              onPress={() => setActiveTab('downloadable')}
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
              }
            />
          ) : (
            renderDownloadableList()
          )}
        </View>
      </View>
      {renderDownloadsButton()}
      
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
            <ActivityIndicator size="large" color={getThemeAwareColor('#4a0660', currentTheme)} />
            <RNText style={[styles.loadingText, { color: themeColors.text }]}>
              {importingModelName ? `Importing ${importingModelName}...` : 'Importing model...'}
            </RNText>
            <RNText style={[styles.loadingSubtext, { color: themeColors.secondaryText }]}>
              {importingModelName ? 'Moving model to app storage' : 'This may take a while for large models'}
            </RNText>
          </View>
        </View>
      )}
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
    paddingBottom: 8,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginTop: 8,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
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
}); 