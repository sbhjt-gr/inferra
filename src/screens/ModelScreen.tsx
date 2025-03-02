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
  Animated,
} from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
import CustomUrlDialog from '../components/CustomUrlDialog';
import { modelDownloader, DownloadProgress } from '../services/ModelDownloader';
import DownloadsDialog from '../components/DownloadsDialog';
import { useDownloads } from '../context/DownloadContext';

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
  quantization: string;
}

const DOWNLOADABLE_MODELS: DownloadableModel[] = [
  {
    "name": "Phi-3 Mini Instruct",
    "size": "2.2 GB  ",
    "huggingFaceLink": "https://huggingface.co/bartowski/Phi-3-mini-4k-instruct-GGUF/resolve/main/Phi-3-mini-4k-instruct-Q4_K_M.gguf",
    "modelFamily": "3.8 Billion",
    "quantization": "Q4_K_M"
  },
  {
    "name": "Qwen 2.5 Coder Instruct",
    "size": "2.27 GB  ",
    "huggingFaceLink": "https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q5_k_m.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q5_K_M"
  },
  {
    "name": "CodeLlama",
    "size": "2.95 GB  ",
    "huggingFaceLink": "https://huggingface.co/TheBloke/CodeLlama-7B-GGUF/resolve/main/codellama-7b.Q3_K_S.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q3_K_S"
  },
  {
    "name": "DeepSeek R1 Distill",
    "size": "3.8 GB  ",
    "huggingFaceLink": "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q4_K_M"
  },
  {
    "name": "Mistral Instruct",
    "size": "4.1 GB  ",
    "huggingFaceLink": "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q4_K_M"
  },
  {
    "name": "DeepSeek Base",
    "size": "4.6 GB  ",
    "huggingFaceLink": "https://huggingface.co/TheBloke/deepseek-llm-7B-base-GGUF/resolve/main/deepseek-llm-7b-base.Q4_K_S.gguf",
    "modelFamily": "8 Billion",
    "quantization": "Q4_K_S"
  },
  {
    "name": "LLaMA 3.1 Instruct",
    "size": "4.7 GB  ",
    "huggingFaceLink": "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    "modelFamily": "8 Billion",
    "quantization": "Q4_K_M"
  },
  {
    "name": "DeepSeek Coder Instruct",
    "size": "4.8 GB  ",
    "huggingFaceLink": "https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct-Q6_K.gguf",
    "modelFamily": "6.7 Billion",
    "quantization": "Q6_K"
  },
  {
    "name": "CodeGemma Instruct",
    "size": "5.1 GB  ",
    "huggingFaceLink": "https://huggingface.co/bartowski/codegemma-7b-it-GGUF/resolve/main/codegemma-7b-it-Q6_K.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q6_K"
  },
  {
    "name": "Mistral Grok",
    "size": "5.1 GB  ",
    "huggingFaceLink": "https://huggingface.co/mradermacher/mistral-7b-grok-GGUF/resolve/main/mistral-7b-grok.Q3_K_L.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q3_K_L"
  },
  {
    "name": "Qwen 2.5 Instruct",
    "size": "5.2 GB  ",
    "huggingFaceLink": "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q6_K.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q6_K"
  },
  {
    "name": "Gemma 2 Instruct",
    "size": "5.4 GB  ",
    "huggingFaceLink": "https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/resolve/main/gemma-2-9b-it-Q4_K_M.gguf",
    "modelFamily": "9 Billion",
    "quantization": "Q4_K_M"
  },
  {
    "name": "LLaMA 2 Chat",
    "size": "8.7 GB  ",
    "huggingFaceLink": "https://huggingface.co/TheBloke/Llama-2-13B-chat-GGUF/resolve/main/llama-2-13b-chat.Q5_K_M.gguf",
    "modelFamily": "13 Billion",
    "quantization": "Q5_K_M"
  }
];

const formatBytes = (bytes?: number) => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 B';
  try {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i < 0 || i >= sizes.length || !isFinite(bytes)) return '0 B';
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  } catch (error) {
    console.error('Error formatting bytes:', error, bytes);
    return '0 B';
  }
};

const getProgressText = (data: DownloadProgress[string]) => {
  if (!data) return '0% • 0 B / 0 B';
  
  const progress = typeof data.progress === 'number' ? data.progress : 0;
  const bytesDownloaded = typeof data.bytesDownloaded === 'number' ? data.bytesDownloaded : 0;
  const totalBytes = typeof data.totalBytes === 'number' && data.totalBytes > 0 ? data.totalBytes : 0;
  
  const downloadedFormatted = formatBytes(bytesDownloaded);
  const totalFormatted = formatBytes(totalBytes);
  
  return `${progress}% • ${downloadedFormatted} / ${totalFormatted}`;
};

// Add this at the top level, outside the component
let globalCheckInterval: NodeJS.Timeout | null = null;

export default function ModelScreen({ navigation }: ModelScreenProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const [activeTab, setActiveTab] = useState<'stored' | 'downloadable'>('stored');
  const [storedModels, setStoredModels] = useState<StoredModel[]>([]);
  const { downloadProgress, setDownloadProgress, activeDownloadsCount } = useDownloads();
  const [isDownloadsDialogVisible, setIsDownloadsDialogVisible] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [isCustomUrlValid, setIsCustomUrlValid] = useState(false);
  const [isCustomUrlLoading, setIsCustomUrlLoading] = useState(false);
  const [customUrlDialogVisible, setCustomUrlDialogVisible] = useState(false);
  const [isDownloadsVisible, setIsDownloadsVisible] = useState(false);
  const buttonScale = useRef(new Animated.Value(1)).current;

  const validateModelUrl = (url: string) => {
    setCustomUrl(url);
    // Only check if it's a valid URL
    const isValid = url.trim().length > 0 && 
      (url.startsWith('http://') || url.startsWith('https://'));
    setIsCustomUrlValid(isValid);
  };

  const handleCustomDownload = async (downloadId: number, modelName: string) => {
    // Navigate to Downloads screen immediately
    navigation.navigate('Downloads');
    
    // Add to download progress tracking with the full filename
    setDownloadProgress(prev => ({
      ...prev,
      [modelName.split('/').pop() || modelName]: { // Get just the filename
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'starting',
        downloadId
      }
    }));
    
    // Close the custom URL dialog
    setCustomUrlDialogVisible(false);
  };

  const handlePauseResume = async (downloadId: number, modelName: string, shouldResume: boolean) => {
    try {
      setDownloadProgress(prev => ({
        ...prev,
        [modelName]: {
          ...prev[modelName],
          status: shouldResume ? 'downloading' : 'paused'
        }
      }));
      
      if (shouldResume) {
        await modelDownloader.resumeDownload(downloadId);
      } else {
        await modelDownloader.pauseDownload(downloadId);
      }
    } catch (error) {
      console.error('Error toggling download state:', error);
      Alert.alert('Error', `Failed to ${shouldResume ? 'resume' : 'pause'} download`);
    }
  };

  const handleCancel = async (downloadId: number, modelName: string) => {
    Alert.alert(
      'Cancel Download',
      'Are you sure you want to cancel this download?',
      [
        {
          text: 'No',
          style: 'cancel'
        },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await modelDownloader.cancelDownload(downloadId);
              setDownloadProgress(prev => {
                const newProgress = { ...prev };
                delete newProgress[modelName];
                return newProgress;
              });
            } catch (error) {
              console.error('Error canceling download:', error);
              Alert.alert('Error', 'Failed to cancel download');
            }
          }
        }
      ]
    );
  };

  const DownloadableModelList = ({ 
    downloadProgress, 
    setDownloadProgress
  }: { 
    downloadProgress: DownloadProgress;
    setDownloadProgress: React.Dispatch<React.SetStateAction<DownloadProgress>>;
  }) => {
    const { theme: currentTheme } = useTheme();
    const themeColors = theme[currentTheme as 'light' | 'dark'];
    const [downloadingModels, setDownloadingModels] = useState<{ [key: string]: boolean }>({});
    const [initializingDownloads, setInitializingDownloads] = useState<{ [key: string]: boolean }>({});

    const handleDownload = async (model: DownloadableModel) => {
      // Navigate to Downloads screen immediately
      navigation.navigate('Downloads');
      
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
                    {model.name.replace(/ \([^)]+\)$/, '')}
                  </Text>
                  <View style={styles.modelBadgesContainer}>
                    <View style={[styles.modelFamily, { backgroundColor: '#4a0660' }]}>
                      <Text style={styles.modelFamilyText}>{model.modelFamily}</Text>
                    </View>
                    <View style={[styles.modelQuantization, { backgroundColor: '#2c7fb8' }]}>
                      <Text style={styles.modelQuantizationText}>{model.quantization}</Text>
                    </View>
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
              {downloadProgress[model.name] && downloadProgress[model.name].status !== 'completed' && downloadProgress[model.name].status !== 'failed' && (
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
    const themeColors = theme[currentTheme as 'light' | 'dark'];

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
                      style={styles.cancelDownloadButton}
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
    const handleProgress = ({ modelName, ...progress }: { 
      modelName: string;
      progress: number;
      bytesDownloaded: number;
      totalBytes: number;
      status: string;
      downloadId: number;
    }) => {
      // Get just the filename without path
      const filename = modelName.split('/').pop() || modelName;
      
      console.log(`Download progress for ${filename}:`, progress.status, progress.progress);
      
      if (progress.status === 'completed') {
        console.log(`Download completed for ${filename}`);
        // Remove the download from progress tracking immediately
        setDownloadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[filename];
          return newProgress;
        });
        
        // Refresh the stored models list to show the new model
        setTimeout(loadStoredModels, 1000);
      } else if (progress.status === 'failed') {
        console.log(`Download failed for ${filename}`);
        // Remove failed downloads from progress tracking
        setDownloadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[filename];
          return newProgress;
        });
      } else {
        // Update progress for active downloads
        setDownloadProgress(prev => {
          // Make sure we have valid numbers
          const bytesDownloaded = typeof progress.bytesDownloaded === 'number' ? progress.bytesDownloaded : 0;
          const totalBytes = typeof progress.totalBytes === 'number' ? progress.totalBytes : 0;
          
          return {
            ...prev,
            [filename]: {
              progress: progress.progress || 0,
              bytesDownloaded,
              totalBytes,
              status: progress.status,
              downloadId: progress.downloadId
            }
          };
        });
      }
    };

    modelDownloader.on('downloadProgress', handleProgress);
    return () => {
      modelDownloader.removeListener('downloadProgress', handleProgress);
    };
  }, []);

  // Add this effect to refresh models when downloads complete
  useEffect(() => {
    if (activeDownloadsCount === 0) {
      loadStoredModels();
    }
  }, [activeDownloadsCount]);

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
          navigation={navigation}
        />
      </ScrollView>
    </View>
  );

  const renderItem = ({ item }: { item: StoredModel }) => {
    const filename = item.name.split('/').pop() || item.name;
    const downloadInfo = downloadProgress[filename];
    
    // Only show download info if it exists and is not completed or failed
    const showDownloadInfo = downloadInfo && 
                            downloadInfo.status !== 'completed' && 
                            downloadInfo.status !== 'failed';
    
    return (
      <TouchableOpacity
        style={[styles.modelCard, { backgroundColor: themeColors.borderColor }]}
        onPress={() => {
          navigation.navigate('HomeTab', {
            chatId: undefined,
            modelPath: item.path,
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
          {showDownloadInfo && (
            <View style={styles.downloadProgress}>
              <View style={styles.downloadStatusRow}>
                <Text style={[styles.modelDetails, { color: themeColors.secondaryText }]}>
                  {`${downloadInfo.progress}% • ${formatBytes(downloadInfo.bytesDownloaded)} / ${formatBytes(downloadInfo.totalBytes)}`}
                  {downloadInfo.status === 'paused' && ' (Paused)'}
                </Text>
                <View style={styles.downloadActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handlePauseResume(downloadInfo.downloadId, item.name, downloadInfo.status === 'paused')}
                  >
                    <Ionicons 
                      name={downloadInfo.status === 'paused' ? "play-circle" : "pause-circle"} 
                      size={24} 
                      color="#4a0660" 
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => handleCancel(downloadInfo.downloadId, item.name)}
                  >
                    <Ionicons name="close-circle" size={24} color="#ff4444" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.progressBar, { backgroundColor: themeColors.background }]}>
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      width: `${downloadInfo.progress}%`, 
                      backgroundColor: downloadInfo.status === 'paused' ? '#666' : '#4a0660' 
                    }
                  ]} 
                />
              </View>
            </View>
          )}
        </View>
        {!showDownloadInfo && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash-outline" size={20} color="#ff4444" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  // Add this effect to animate the button when downloads change
  useEffect(() => {
    if (activeDownloadsCount > 0) {
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
  }, [activeDownloadsCount]);

  // Add this before the return statement
  const renderDownloadsButton = () => {
    if (activeDownloadsCount === 0) return null;

    return (
      <Animated.View 
        style={[
          styles.floatingButton,
          { transform: [{ scale: buttonScale }] }
        ]}
      >
        <TouchableOpacity
          style={[styles.floatingButtonContent, { backgroundColor: '#4a0660' }]}
          onPress={() => navigation.navigate('Downloads')}
        >
          <Ionicons name="cloud-download" size={24} color="#fff" />
          <View style={styles.downloadCount}>
            <Text style={styles.downloadCountText}>{activeDownloadsCount}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

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
      {renderDownloadsButton()}
      
      <DownloadsDialog
        visible={isDownloadsVisible}
        onClose={() => setIsDownloadsVisible(false)}
        downloads={downloadProgress}
        setDownloadProgress={setDownloadProgress}
      />
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
  modelBadgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
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
  modelQuantization: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
  },
  modelQuantizationText: {
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
  downloadProgressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  downloadProgressFill: {
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
  cancelDownloadButton: {
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
  floatingButton: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    zIndex: 1000,
  },
  floatingButtonContent: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
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
  downloadStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  downloadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  cancelButton: {
    padding: 4,
  },
}); 