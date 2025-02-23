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
  ScrollView,
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
import CustomUrlDialog from '../components/CustomUrlDialog';
import { modelDownloader, DownloadProgress } from '../services/ModelDownloader';

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
    size: "2.27 GB  ",
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
  const [activeTab, setActiveTab] = useState<'stored' | 'downloadable'>('stored');
  const [storedModels, setStoredModels] = useState<StoredModel[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({});
  const [isDownloadsDialogVisible, setIsDownloadsDialogVisible] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [isCustomUrlValid, setIsCustomUrlValid] = useState(false);
  const [isCustomUrlLoading, setIsCustomUrlLoading] = useState(false);
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
      
      const { downloadId } = await modelDownloader.downloadModel(
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
    setDownloadProgress
  }: { 
    downloadProgress: DownloadProgress;
    setDownloadProgress: React.Dispatch<React.SetStateAction<DownloadProgress>>;
  }) => {
    const { theme: currentTheme } = useTheme();
    const themeColors = theme[currentTheme];
    const [downloadingModels, setDownloadingModels] = useState<{ [key: string]: boolean }>({});
    const [initializingDownloads, setInitializingDownloads] = useState<{ [key: string]: boolean }>({});

    const handleDownload = async (model: DownloadableModel) => {
      try {
        setInitializingDownloads(prev => ({ ...prev, [model.name]: true }));
        
        setDownloadProgress(prev => ({
          ...prev,
          [model.name]: {
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            status: 'starting',
            downloadId: 0
          }
        }));
        
        const { downloadId } = await modelDownloader.downloadModel(
          model.huggingFaceLink, 
          model.name
        );
        
        setDownloadProgress(prev => ({
          ...prev,
          [model.name]: {
            ...prev[model.name],
            downloadId
          }
        }));

      } catch (error) {
        console.error('Download error:', error);
        setDownloadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[model.name];
          return newProgress;
        });
        Alert.alert('Error', 'Failed to start download');
      } finally {
        setInitializingDownloads(prev => ({ ...prev, [model.name]: false }));
      }
    };

    return (
      <ScrollView 
        style={styles.downloadableContainer}
        contentContainerStyle={styles.downloadableList}
        showsVerticalScrollIndicator={false}
      >
        {DOWNLOADABLE_MODELS.map(model => (
          <View 
            key={model.name} 
            style={[styles.downloadableCard, { backgroundColor: themeColors.borderColor }]}
          >
            <View style={styles.downloadableInfo}>
              <View style={styles.modelHeader}>
                <View style={styles.modelTitleContainer}>
                  <Text style={[styles.downloadableName, { color: themeColors.text }]}>
                    {model.name}
                  </Text>
                  <View style={[styles.modelFamily, { backgroundColor: '#4a0660' }]}>
                    <Text style={styles.modelFamilyText}>{model.modelFamily}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.downloadButton, 
                    { backgroundColor: '#4a0660' },
                    (downloadingModels[model.name] || downloadProgress[model.name] || initializingDownloads[model.name]) && { opacity: 0.5 }
                  ]}
                  onPress={() => handleDownload(model)}
                  disabled={Boolean(downloadingModels[model.name] || downloadProgress[model.name] || initializingDownloads[model.name])}
                >
                  <Ionicons 
                    name={
                      initializingDownloads[model.name] 
                        ? "sync" 
                        : downloadingModels[model.name] || downloadProgress[model.name] 
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
                    {model.size}
                  </Text>
                </View>
              </View>
              {downloadProgress[model.name] && (
                <View style={styles.downloadProgress}>
                  <Text style={[styles.modelDetails, { color: themeColors.secondaryText }]}>
                    {getProgressText(downloadProgress[model.name])}
                  </Text>
                  <View style={[styles.progressBar, { backgroundColor: themeColors.background }]}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { 
                          width: `${downloadProgress[model.name].progress}%`, 
                          backgroundColor: '#4a0660' 
                        }
                      ]} 
                    />
                  </View>
                </View>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
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
      value.status !== 'completed' && value.status !== 'failed'
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
        await modelDownloader.cancelDownload(downloadInfo.downloadId);
        
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
      const models = await modelDownloader.getStoredModels();
      setStoredModels(models);
    } catch (error) {
      console.error('Error loading stored models:', error);
    }
  };

  useEffect(() => {
    loadStoredModels();
  }, []);

  useEffect(() => {
    const handleProgress = ({ modelName, ...progress }) => {
      const displayName = modelName.split('.')[0];
      
      // Batch state updates to reduce re-renders
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        
        if (progress.status === 'completed') {
          // If completed, remove from progress and load stored models once
          delete newProgress[displayName];
          // Schedule stored models refresh
          setTimeout(loadStoredModels, 1000);
        } else if (progress.status === 'failed') {
          // If failed, just remove from progress
          delete newProgress[displayName];
        } else {
          // Update progress
          newProgress[displayName] = progress;
        }
        
        return newProgress;
      });
    };

    modelDownloader.on('downloadProgress', handleProgress);
    return () => modelDownloader.removeListener('downloadProgress', handleProgress);
  }, []);

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
              await modelDownloader.deleteModel(model.path);
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

  // Update the renderDownloadableList function
  const renderDownloadableList = () => (
    <View style={styles.downloadableContainer}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
      >
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
          setDownloadProgress={setDownloadProgress}
        />

        <CustomUrlDialog
          visible={customUrlDialogVisible}
          onClose={() => setCustomUrlDialogVisible(false)}
          onDownloadStart={handleCustomDownload}
        />
      </ScrollView>
    </View>
  );

  const renderItem = ({ item }: { item: StoredModel }) => (
    <TouchableOpacity
      style={[styles.modelCard, { backgroundColor: themeColors.borderColor }]}
      onPress={() => {
        // Navigate to Home tab and pass a parameter to open model selector
        navigation.navigate('HomeTab', {
          openModelSelector: true,
          preselectedModelPath: item.path
        });
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
    paddingTop: 0,
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