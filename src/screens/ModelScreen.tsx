import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  NativeModules,
  Linking,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { llamaManager } from '../utils/LlamaManager';
import AppHeader from '../components/AppHeader';
import DownloadManager from '../components/DownloadManager';
import CustomUrlDialog from '../components/CustomUrlDialog';

type ModelScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Model'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

interface StoredModel {
  name: string;
  path: string;
  size: number;
  modified: string;
}

interface DownloadableModel {
  name: string;
  description?: string;
  size: string;
  huggingFaceLink: string;
  modelFamily: string;
}

interface ModelDownloaderType {
  downloadModel: (url: string, filename: string) => Promise<{ downloadId: number; path: string }>;
  checkDownloadStatus: (downloadId: number) => Promise<{
    status: string;
    bytesDownloaded?: number;
    totalBytes?: number;
    reason?: string;
  }>;
  cancelDownload: (downloadId: number) => Promise<boolean>;
  getStoredModels: () => Promise<StoredModel[]>;
  deleteModel: (path: string) => Promise<boolean>;
}

interface DownloadProgress {
  [key: string]: {
    progress: number;
    bytesDownloaded: number;
    totalBytes: number;
    status: string;
    downloadId: number;
  };
}

const ModelDownloaderModule = NativeModules.ModelDownloader as ModelDownloaderType;

const DOWNLOADABLE_MODELS: DownloadableModel[] = [
  {
    name: "DeepSeek-R1 Distill Llama 8B",
    size: "4.6 GB ",
    huggingFaceLink: "https://huggingface.co/TheBloke/deepseek-llm-7B-base-GGUF/resolve/main/deepseek-llm-7b-base.Q4_K_S.gguf",
    modelFamily: "DeepSeek"
  },
  {
    name: "Deepseek 7B Base",
    size: "3.8 GB ",
    huggingFaceLink: "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf",
    modelFamily: "DeepSeek"
  },
  {
    name: "CodeLlama 7B",
    size: "2.95 GB  ",
    huggingFaceLink: "https://huggingface.co/TheBloke/CodeLlama-7B-GGUF/resolve/main/codellama-7b.Q3_K_S.gguf",
    modelFamily: "Llama"
  },
  {
    name: "Mistral 7B Grok",
    size: "5.1 GB ",
    huggingFaceLink: "https://huggingface.co/mradermacher/mistral-7b-grok-GGUF/resolve/main/mistral-7b-grok.Q3_K_L.gguf",
    modelFamily: "Grok"
  },
  {
    name: "Qwen 7B",
    size: "2.44 GB  ",
    huggingFaceLink: "https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q5_k_m.gguf",
    modelFamily: "Qwen"
  }
];

const formatBytes = (bytes?: number) => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const getProgressText = (data: DownloadProgress[string]) => {
  const downloaded = formatBytes(data.bytesDownloaded);
  const total = data.totalBytes > 0 ? formatBytes(data.totalBytes) : 'Unknown size';
  return `${data.progress}% • ${downloaded} / ${total}`;
};

// Add this at the top level, outside the component
let globalCheckInterval: NodeJS.Timeout | null = null;

export default function ModelScreen({ navigation }: ModelScreenProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const [activeTab, setActiveTab] = useState<'stored' | 'download'>('stored');
  const [storedModels, setStoredModels] = useState<StoredModel[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({});
  const [isDownloadsDialogVisible, setIsDownloadsDialogVisible] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [isCustomUrlValid, setIsCustomUrlValid] = useState(false);
  const [isCustomUrlLoading, setIsCustomUrlLoading] = useState(false);
  const [hasActiveDownloads, setHasActiveDownloads] = useState(false);
  const [downloadManagerVisible, setDownloadManagerVisible] = useState(false);
  const downloadManagerRef = useRef<{
    addDownload: (downloadId: number, name: string) => void;
  } | null>(null);

  // Add these refs at the component level
  const downloadCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeDownloadsRef = useRef<{[key: string]: boolean}>({});

  // Add state for custom URL dialog
  const [customUrlDialogVisible, setCustomUrlDialogVisible] = useState(false);

  const validateModelUrl = (url: string) => {
    setCustomUrl(url);
    // Only check if it's a valid URL
    const isValid = url.trim().length > 0 && 
      (url.startsWith('http://') || url.startsWith('https://'));
    setIsCustomUrlValid(isValid);
  };

  const handleCustomDownload = async (onDownloadStart: (downloadId: number, modelName: string) => void) => {
    if (!isCustomUrlValid) return;
    
    setIsCustomUrlLoading(true);
    try {
      const response = await fetch(customUrl, { method: 'HEAD' });
      const contentDisposition = response.headers.get('content-disposition');
      
      let filename = '';
      if (contentDisposition) {
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      }

      if (!filename) {
        filename = customUrl.split('/').pop() || 'custom_model.gguf';
      }

      if (!filename.toLowerCase().endsWith('.gguf')) {
        Alert.alert(
          'Invalid File',
          'Only GGUF model files are supported. Please make sure you are downloading a GGUF model file.'
        );
        return;
      }
      
      const { downloadId } = await ModelDownloaderModule.downloadModel(
        customUrl,
        filename
      );
      
      setDownloadProgress(prev => ({
        ...prev,
        [filename]: {
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
          status: '',
          downloadId
        }
      }));
      
      onDownloadStart(downloadId, filename);
      setCustomUrl('');
      

    } catch (error) {
      console.error('Custom download error:', error);
      Alert.alert('Error', 'Failed to start download');
    } finally {
      setIsCustomUrlLoading(false);
    }
  };

  

  const DownloadableModelList = ({ 
    downloadProgress, 
    onDownloadStart,
    setDownloadProgress
  }: { 
    downloadProgress: DownloadProgress; 
    onDownloadStart: (downloadId: number, modelName: string) => void;
    setDownloadProgress: React.Dispatch<React.SetStateAction<DownloadProgress>>;
  }) => {
    const { theme: currentTheme } = useTheme();
    const themeColors = theme[currentTheme];
    const [downloadingModels, setDownloadingModels] = useState<{ [key: string]: boolean }>({});
    const [initializingDownloads, setInitializingDownloads] = useState<{ [key: string]: boolean }>({});

    const openHuggingFace = (url: string) => {
      Linking.openURL(url);
    };

    const handleDownload = async (model: DownloadableModel) => {
      try {
        setInitializingDownloads(prev => ({ ...prev, [model.name]: true }));
        
        // First check if the URL points to a .gguf file
        const response = await fetch(model.huggingFaceLink, { method: 'HEAD' });
        const contentDisposition = response.headers.get('content-disposition');
        const contentType = response.headers.get('content-type');
        
        // Try to get filename from content-disposition header
        let remoteFilename = '';
        if (contentDisposition) {
          const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
          if (matches != null && matches[1]) {
            remoteFilename = matches[1].replace(/['"]/g, '');
          }
        }

        // If no filename in header, try to get it from URL
        if (!remoteFilename) {
          remoteFilename = model.huggingFaceLink.split('/').pop() || '';
        }

        // Check if file is a GGUF file
        if (!remoteFilename.toLowerCase().endsWith('.gguf')) {
          Alert.alert(
            'Invalid File',
            'Only GGUF model files are supported. Please make sure you are downloading a GGUF model file.'
          );
          return;
        }

        setDownloadingModels(prev => ({ ...prev, [model.name]: true }));
        
        // Create a filename for local storage
        const localFilename = `${model.name.toLowerCase().replace(/\s+/g, '_')}.gguf`;
        
        // Initialize progress immediately with proper typing
        setDownloadProgress(prev => ({
          ...prev,
          [model.name]: {
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            status: '',
            downloadId: 0
          }
        }));
        
        // Start the download
        const { downloadId, path } = await ModelDownloaderModule.downloadModel(
          model.huggingFaceLink, 
          localFilename
        );
        
        // Update the progress with the downloadId
        setDownloadProgress(prev => ({
          ...prev,
          [model.name]: {
            ...prev[model.name],
            downloadId
          }
        }));
        
        // Start tracking progress
        onDownloadStart(downloadId, model.name);
        

      } catch (error) {
        console.error('Download error:', error);
        if (error instanceof Error) {
          Alert.alert('Error', error.message || 'Failed to start download');
        } else {
          Alert.alert('Error', 'Failed to start download');
        }
        // Clean up progress state on error
        setDownloadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[model.name];
          return newProgress;
        });
      } finally {
        setDownloadingModels(prev => ({ ...prev, [model.name]: false }));
        setInitializingDownloads(prev => ({ ...prev, [model.name]: false }));
      }
    };

    const renderDownloadableItem = ({ item }: { item: DownloadableModel }) => (
      <View style={[styles.downloadableCard, { backgroundColor: themeColors.borderColor }]}>
        <View style={styles.downloadableInfo}>
          <View style={styles.modelHeader}>
            <View style={styles.modelTitleContainer}>
              <Text style={[styles.downloadableName, { color: themeColors.text }]}>
                {item.name}
              </Text>
              <View style={[styles.modelFamily, { backgroundColor: '#4a0660' }]}>
                <Text style={styles.modelFamilyText}>{item.modelFamily}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.downloadButton, 
                { backgroundColor: '#4a0660' },
                (downloadingModels[item.name] || downloadProgress[item.name] || initializingDownloads[item.name]) && { opacity: 0.5 }
              ]}
              onPress={() => handleDownload(item)}
              disabled={Boolean(downloadingModels[item.name] || downloadProgress[item.name] || initializingDownloads[item.name])}
            >
              <Ionicons 
                name={
                  initializingDownloads[item.name] 
                    ? "sync" 
                    : downloadingModels[item.name] || downloadProgress[item.name] 
                      ? "hourglass-outline" 
                      : "cloud-download-outline"
                } 
                size={20} 
                color="#fff" 
              />
            </TouchableOpacity>
          </View>
          <View style={styles.modelMetaInfo}>
            <View style={styles.metaItem}>
              <Ionicons name="disc-outline" size={16} color={themeColors.secondaryText} />
              <Text style={[styles.metaText, { color: themeColors.secondaryText }]}>
                {item.size}
              </Text>
            </View>
          </View>
          {downloadProgress[item.name] && (
            <View style={styles.downloadProgress}>
              <Text style={[styles.modelDetails, { color: themeColors.secondaryText }]}>
                {getProgressText(downloadProgress[item.name])}
              </Text>
              <View style={[styles.progressBar, { backgroundColor: themeColors.background }]}>
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      width: `${downloadProgress[item.name].progress}%`, 
                      backgroundColor: '#4a0660' 
                    }
                  ]} 
                />
              </View>
            </View>
          )}
        </View>
      </View>
    );

    return (
      <View style={styles.downloadableContainer}>
        <FlatList
          data={DOWNLOADABLE_MODELS}
          renderItem={renderDownloadableItem}
          keyExtractor={item => item.name}
          contentContainerStyle={styles.downloadableList}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  };

  const DownloadsDialog = ({ 
    visible, 
    onClose, 
    downloads,
    setDownloadProgress
  }: { 
    visible: boolean; 
    onClose: () => void; 
    downloads: DownloadProgress;
    setDownloadProgress: React.Dispatch<React.SetStateAction<DownloadProgress>>;
  }) => {
    const { theme: currentTheme } = useTheme();
    const themeColors = theme[currentTheme];

    const activeDownloads = Object.entries(downloads).filter(([_, value]) => 
      value.progress < 100
    );

    const handleCancel = async (modelName: string) => {
      try {
        const downloadInfo = downloads[modelName];
        if (!downloadInfo) {
          throw new Error('Download information not found');
        }

        // First remove from progress tracking to stop status checks
        setDownloadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[modelName];
          return newProgress;
        });

        // Then cancel the download
        await ModelDownloaderModule.cancelDownload(downloadInfo.downloadId);
        
        // Removed the cancellation dialog
      } catch (error) {
        console.error('Error cancelling download:', error);
        Alert.alert('Error', 'Failed to cancel download');
      }
    };

    return (
      <Modal
        visible={visible}
        transparent={true}
        animationType="fade"
        onRequestClose={onClose}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={onClose}
        >
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Active Downloads ({activeDownloads.length})
              </Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>
            
            {activeDownloads.length === 0 ? (
              <Text style={[styles.emptyText, { color: themeColors.secondaryText }]}>
                No active downloads
              </Text>
            ) : (
              activeDownloads.map(([name, data]) => (
                <View key={name} style={styles.downloadItem}>
                  <View style={styles.downloadItemHeader}>
                    <Text style={[styles.downloadItemName, { color: themeColors.text }]}>
                      {name}
                    </Text>
                    <TouchableOpacity 
                      style={styles.cancelButton}
                      onPress={() => handleCancel(name)}
                    >
                      <Ionicons name="close-circle" size={24} color="#ff4444" />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.downloadItemProgress, { color: themeColors.secondaryText }]}>
                    {getProgressText(data)}
                  </Text>
                  <View style={[styles.progressBar, { backgroundColor: themeColors.borderColor }]}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { width: `${data.progress}%`, backgroundColor: '#4a0660' }
                      ]} 
                    />
                  </View>
                </View>
              ))
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  const loadStoredModels = async () => {
    try {
      const models = await ModelDownloaderModule.getStoredModels();
      setStoredModels(models);
    } catch (error) {
      console.error('Error loading stored models:', error);
    }
  };

  useEffect(() => {
    loadStoredModels();
    // Refresh list every 30 seconds instead of 5 seconds
    const interval = setInterval(loadStoredModels, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkDownloadProgress = async () => {
    const activeDownloads = { ...downloadProgress };
    let stillActive = false;

    for (const [modelName, data] of Object.entries(activeDownloads)) {
      try {
        const status = await ModelDownloaderModule.checkDownloadStatus(data.downloadId);
        
        if (status.status === 'failed' || !status.bytesDownloaded) {
          setDownloadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[modelName];
            return newProgress;
          });
          continue;
        }

        const totalBytes = status.totalBytes || 0;
        const bytesDownloaded = status.bytesDownloaded || 0;
        const progress = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;

        if (progress < 100) {
          stillActive = true;
        }

        setDownloadProgress(prev => ({
          ...prev,
          [modelName]: {
            ...prev[modelName],
            progress,
            bytesDownloaded,
            totalBytes,
            status: status.status
          }
        }));
      } catch (error) {
        console.error(`Error checking download status for ${modelName}:`, error);
      }
    }

    setHasActiveDownloads(stillActive);
    return stillActive;
  };

  useEffect(() => {
    const startChecking = async () => {
      // Clear any existing interval
      if (globalCheckInterval) {
        clearInterval(globalCheckInterval);
        globalCheckInterval = null;
      }

      // If there are downloads, start checking
      if (Object.keys(downloadProgress).length > 0) {
        // Check immediately
        const hasActive = await checkDownloadProgress();
        
        if (hasActive) {
          // Start interval
          globalCheckInterval = setInterval(checkDownloadProgress, 1000);
        }
      } else {
        setHasActiveDownloads(false);
      }
    };

    startChecking();

    // Cleanup
    return () => {
      if (globalCheckInterval) {
        clearInterval(globalCheckInterval);
        globalCheckInterval = null;
      }
    };
  }, [downloadProgress]);

  const handleDelete = (model: StoredModel) => {
    Alert.alert(
      'Delete Model',
      `Are you sure you want to delete ${model.name}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ModelDownloaderModule.deleteModel(model.path);
              loadStoredModels();
            } catch (error) {
              console.error('Error deleting model:', error);
              Alert.alert('Error', 'Failed to delete model');
            }
          },
        },
      ]
    );
  };

  const getDisplayName = (filename: string) => {
    return filename.split('.')[0];
  };

  const handleDownloadStart = async (downloadId: number, modelName: string) => {
    console.log('Starting download:', downloadId, modelName); // Debug log
    if (downloadManagerRef.current) {
      downloadManagerRef.current.addDownload(downloadId, modelName);
      setDownloadManagerVisible(true);
    }
  };

  // Add button to the downloadable list section
  const renderDownloadableList = () => (
    <View style={styles.downloadableContainer}>
      <TouchableOpacity
        style={[styles.customUrlButton, { backgroundColor: themeColors.borderColor }]}
        onPress={() => setCustomUrlDialogVisible(true)}
      >
        <View style={styles.customUrlButtonContent}>
          <View style={styles.customUrlIconContainer}>
            <Ionicons name="add-circle-outline" size={24} color="#4a0660" />
          </View>
          <View style={styles.customUrlTextContainer}>
            <Text style={[styles.customUrlButtonTitle, { color: themeColors.text }]}>
              Download from URL
            </Text>
            <Text style={[styles.customUrlButtonSubtitle, { color: themeColors.secondaryText }]}>
              Import a custom GGUF model
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
      </TouchableOpacity>

      <DownloadableModelList
        downloadProgress={downloadProgress}
        onDownloadStart={handleDownloadStart}
        setDownloadProgress={setDownloadProgress}
      />

      <CustomUrlDialog
        visible={customUrlDialogVisible}
        onClose={() => setCustomUrlDialogVisible(false)}
        onDownloadStart={handleDownloadStart}
      />
    </View>
  );

  const renderItem = ({ item }: { item: StoredModel }) => (
    <TouchableOpacity
      style={[styles.modelCard, { backgroundColor: themeColors.borderColor }]}
      onPress={async () => {
        try {
          await llamaManager.initializeModel(item.path);
          Alert.alert('Success', 'Model loaded successfully');
        } catch (error) {
          console.error('Error loading model:', error);
          Alert.alert('Error', 'Failed to load model');
        }
      }}
    >
      <View style={styles.modelInfo}>
        <Text style={[styles.modelName, { color: themeColors.text }]} numberOfLines={1}>
          {getDisplayName(item.name)}
        </Text>
        <Text style={[styles.modelDetails, { color: themeColors.secondaryText }]}>
          {formatBytes(item.size)}
        </Text>
        {downloadProgress[item.name] && (
          <View style={styles.downloadProgress}>
            <Text style={[styles.modelDetails, { color: themeColors.secondaryText }]}>
              {getProgressText(downloadProgress[item.name])}
            </Text>
            <View style={[styles.progressBar, { backgroundColor: themeColors.background }]}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${downloadProgress[item.name].progress}%`, backgroundColor: '#4a0660' }
                ]} 
              />
            </View>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDelete(item)}
      >
        <Ionicons name="trash-outline" size={20} color="#ff4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <AppHeader />
      <View style={styles.content}>
        <View style={styles.tabContainer}>
          <View style={[styles.segmentedControl, { backgroundColor: themeColors.borderColor }]}>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                { borderColor: '#4a0660' },
                activeTab === 'stored' && styles.activeSegment,
                activeTab === 'stored' && { backgroundColor: '#4a0660' }
              ]}
              onPress={() => setActiveTab('stored')}
            >
              <Ionicons 
                name="folder-outline" 
                size={18} 
                color={activeTab === 'stored' ? '#fff' : themeColors.text} 
                style={styles.segmentIcon}
              />
              <Text style={[
                styles.segmentText,
                { color: activeTab === 'stored' ? '#fff' : themeColors.text }
              ]}>
                Stored Models
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                { borderColor: '#4a0660' },
                activeTab === 'downloadable' && styles.activeSegment,
                activeTab === 'downloadable' && { backgroundColor: '#4a0660' }
              ]}
              onPress={() => setActiveTab('downloadable')}
            >
              <Ionicons 
                name="cloud-download-outline" 
                size={18} 
                color={activeTab === 'downloadable' ? '#fff' : themeColors.text}
                style={styles.segmentIcon}
              />
              <Text style={[
                styles.segmentText,
                { color: activeTab === 'downloadable' ? '#fff' : themeColors.text }
              ]}>
                Download Models
              </Text>
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
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons 
                    name="folder-open-outline" 
                    size={48} 
                    color={themeColors.secondaryText}
                  />
                  <Text style={[styles.emptyText, { color: themeColors.secondaryText }]}>
                    No models downloaded yet
                  </Text>
                </View>
              }
            />
          ) : (
            renderDownloadableList()
          )}
        </View>
      </View>

      <DownloadManager
        ref={downloadManagerRef}
        visible={downloadManagerVisible}
        onClose={() => setDownloadManagerVisible(false)}
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: '#4a0660' }]}
        onPress={() => setDownloadManagerVisible(true)}
      >
        <View style={styles.fabContent}>
          <Ionicons 
            name="cloud-download-outline" 
            size={24} 
            color="#ffffff" 
          />
          {Object.keys(downloadProgress).length > 0 && (
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>
                {Object.keys(downloadProgress).length}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  modelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  modelInfo: {
    flex: 1,
    gap: 4,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '500',
  },
  modelDetails: {
    fontSize: 14,
    opacity: 0.7,
  },
  deleteButton: {
    padding: 8,
    marginLeft: 12,
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
  downloadableList: {
    padding: 16,
    flexGrow: 1,
  },
  downloadableCard: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  downloadableInfo: {
    padding: 16,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modelTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingRight: 12,
  },
  downloadableName: {
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
    marginBottom: 4,
  },
  modelFamily: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
  },
  modelFamilyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  downloadButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  modelMetaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 13,
    marginLeft: 4,
  },
  viewMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewMoreText: {
    fontSize: 13,
    fontWeight: '600',
    marginRight: 4,
  },
  downloadHeader: {
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    marginBottom: 24,
  },
  downloadableContainer: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  downloadProgress: {
    flex: 1,
    marginTop: 4,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  downloadItem: {
    marginBottom: 16,
  },
  downloadItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  downloadItemName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  downloadItemProgress: {
    fontSize: 14,
    marginBottom: 8,
  },
  cancelButton: {
    padding: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4a0660',
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ff4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  fabBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  customUrlCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  customUrlInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  customUrlInput: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    fontSize: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  customUrlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  customUrlButtonContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customUrlIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customUrlTextContainer: {
    flex: 1,
  },
  customUrlButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  customUrlButtonSubtitle: {
    fontSize: 13,
  },
}); 