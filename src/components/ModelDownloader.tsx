import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { modelDownloader, ModelInfo } from '../services/ModelDownloader';
import { ThemeType, ThemeColors } from '../types/theme';
import { getThemeAwareColor } from '../utils/ColorUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ModelDownloaderType {
  downloadModel: (url: string, filename: string) => Promise<{ downloadId: number; path: string }>;
  checkDownloadStatus: (downloadId: number) => Promise<{
    status: string;
    bytesDownloaded?: number;
    totalBytes?: number;
  }>;
  cancelDownload: (downloadId: number) => Promise<boolean>;
  getStoredModels: () => Promise<ModelInfo[]>;
  deleteModel: (path: string) => Promise<boolean>;
}

// Type assertion for the native module
const ModelDownloaderModule = modelDownloader as ModelDownloaderType;

interface ModelDownloaderProps {
  downloadProgress: DownloadProgress;
  onDownloadStart: (downloadId: number, modelName: string) => void;
}

interface DownloadProgress {
  [key: string]: {
    progress: number;
    bytesDownloaded: number;
    totalBytes: number;
    status: string;
  };
}

const ModelDownloaderComponent = ({ downloadProgress, onDownloadStart }: ModelDownloaderProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as ThemeColors];
  const [url, setUrl] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [currentDownload, setCurrentDownload] = useState<string | null>(null);

  // Clear currentDownload if it's completed
  useEffect(() => {
    if (currentDownload && 
        (!downloadProgress[currentDownload] || 
         downloadProgress[currentDownload]?.status === 'completed' ||
         downloadProgress[currentDownload]?.status === 'failed')) {
      setCurrentDownload(null);
    }
  }, [downloadProgress, currentDownload]);

  const handleDownload = async () => {
    if (!url.trim()) {
      Alert.alert('Error', 'Please enter a valid URL');
      return;
    }

    try {
      setModalVisible(false);
      const filename = url.split('/').pop() || 'model.bin';
      setCurrentDownload(filename);
      
      console.log('Starting download:', { url, filename });
      const result = await modelDownloader.downloadModel(url, filename);
      console.log('Download started:', result);
      
      onDownloadStart(result.downloadId, filename);
      setUrl('');
    } catch (error: any) {  // Type the error as any to access message property
      console.error('Download error:', error);
      setCurrentDownload(null);
      Alert.alert('Error', error.message || 'Failed to download file');
    }
  };

  // Get current download progress if any
  const currentProgress = currentDownload && 
                         downloadProgress[currentDownload] && 
                         downloadProgress[currentDownload].status !== 'completed' && 
                         downloadProgress[currentDownload].status !== 'failed' 
                         ? downloadProgress[currentDownload] 
                         : null;

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0 || isNaN(bytes)) return '0 B';
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

  return (
    <>
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalView, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Download Model
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.warningContainer}>
              <Ionicons name="warning-outline" size={20} color={getThemeAwareColor('#4a0660', currentTheme)} />
              <Text style={[styles.warningText, { color: themeColors.secondaryText }]}>
                Only Georgi Gerganov's GGUF format models are supported.
              </Text>
            </View>
            
            <View style={[styles.inputContainer, { backgroundColor: themeColors.borderColor }]}>
              <Ionicons name="link" size={20} color={themeColors.secondaryText} />
              <TextInput
                style={[styles.input, { color: themeColors.text }]}
                placeholder="Enter model URL"
                placeholderTextColor={themeColors.secondaryText}
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity 
              style={[styles.downloadModalButton, { backgroundColor: '#4a0660' }]}
              onPress={handleDownload}
            >
              <Text style={styles.buttonText}>Start Download</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.container}>
        {currentProgress && (
          <View style={[
            styles.downloadProgressContainer, 
            { 
              backgroundColor: themeColors.background,
              borderBottomColor: 'rgba(150, 150, 150, 0.1)'
            }
          ]}>
            <View style={[styles.downloadCard, { backgroundColor: themeColors.borderColor }]}>
              <View style={styles.downloadHeader}>
                <Ionicons name="cloud-download" size={24} color={themeColors.text} />
                <Text style={[styles.downloadTitle, { color: themeColors.text }]}>
                  Downloading {currentDownload}
                </Text>
              </View>

              <View style={styles.progressSection}>
                <View style={styles.progressInfo}>
                  <Text style={[styles.progressPercentage, { color: themeColors.text }]}>
                    {currentProgress.progress}%
                  </Text>
                  <Text style={[styles.progressDetails, { color: themeColors.secondaryText }]}>
                    {formatBytes(currentProgress.bytesDownloaded)} / {formatBytes(currentProgress.totalBytes)}
                  </Text>
                </View>
                
                <View style={[styles.progressBar, { backgroundColor: themeColors.background }]}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${currentProgress.progress}%`, backgroundColor: '#4a0660' }
                    ]} 
                  />
                </View>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity 
          style={[styles.addButton, { backgroundColor: '#4a0660' }]}
          onPress={() => setModalVisible(true)}
        >
          <View style={styles.addButtonContent}>
            <Ionicons name="add-circle-outline" size={24} color={themeColors.headerText} style={styles.addIcon} />
            <Text style={styles.addButtonText}>Download Other Models</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={themeColors.headerText} />
        </TouchableOpacity>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  downloadProgressContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    padding: 16,
    borderBottomWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    zIndex: 2,
  },
  modalView: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
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
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    lineHeight: 18,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
  },
  downloadModalButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  downloadCard: {
    padding: 16,
    borderRadius: 16,
    width: '100%',
  },
  downloadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  downloadTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  progressSection: {
    marginBottom: 16,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  progressPercentage: {
    fontSize: 24,
    fontWeight: '700',
  },
  progressDetails: {
    fontSize: 14,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#4a0660',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  addButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addIcon: {
    marginRight: 12,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ModelDownloaderComponent; 