import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { modelDownloader } from '../services/ModelDownloader';

interface DownloadsDialogProps {
  visible: boolean;
  onClose: () => void;
  downloads: Record<string, {
    progress: number;
    bytesDownloaded: number;
    totalBytes: number;
    status: string;
    downloadId: number;
    isPaused?: boolean;
  }>;
  setDownloadProgress: React.Dispatch<React.SetStateAction<any>>;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const DownloadsDialog = ({ visible, onClose, downloads, setDownloadProgress }: DownloadsDialogProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  const checkCompletedDownloads = async () => {
    try {
      // Force a check for completed downloads
      await modelDownloader.checkBackgroundDownloads();
      
      // Get the current stored models
      const storedModels = await modelDownloader.getStoredModels();
      const storedModelNames = new Set(storedModels.map(model => model.name));
      
      // Remove any downloads that are actually completed
      setDownloadProgress((prev: Record<string, {
        progress: number;
        bytesDownloaded: number;
        totalBytes: number;
        status: string;
        downloadId: number;
        isPaused?: boolean;
      }>) => {
        const newProgress = { ...prev };
        Object.keys(newProgress).forEach(modelName => {
          if (storedModelNames.has(modelName)) {
            delete newProgress[modelName];
          }
        });
        return newProgress;
      });
    } catch (error) {
      console.error('Error checking completed downloads:', error);
    }
  };

  useEffect(() => {
    if (visible) {
      checkCompletedDownloads();
    }
  }, [visible]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        await checkCompletedDownloads();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Filter out completed and failed downloads
  const activeDownloads = Object.entries(downloads).filter(
    ([_, data]) => data.status !== 'completed' && data.status !== 'failed'
  );

  const handleCancel = async (modelName: string) => {
    try {
      const downloadInfo = downloads[modelName];
      await modelDownloader.cancelDownload(downloadInfo.downloadId);
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[modelName];
        return newProgress;
      });
    } catch (error) {
      console.error('Error canceling download:', error);
    }
  };

  const handlePauseResume = async (modelName: string) => {
    try {
      const downloadInfo = downloads[modelName];
      
      if (downloadInfo.isPaused) {
        // Resume download
        await modelDownloader.resumeDownload(downloadInfo.downloadId);
      } else {
        // Pause download
        await modelDownloader.pauseDownload(downloadInfo.downloadId);
      }
    } catch (error) {
      console.error('Error pausing/resuming download:', error);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: themeColors.text }]}>
              Active Downloads ({activeDownloads.length})
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.downloadsList}>
            {activeDownloads.length === 0 ? (
              <Text style={[styles.emptyText, { color: themeColors.secondaryText }]}>
                No active downloads
              </Text>
            ) : (
              activeDownloads.map(([name, data]) => (
                <View 
                  key={name} 
                  style={[styles.downloadItem, { backgroundColor: themeColors.borderColor }]}
                >
                  <Text style={[styles.downloadName, { color: themeColors.text }]}>
                    {name}
                  </Text>
                  
                  <Text style={[styles.downloadProgress, { color: themeColors.secondaryText }]}>
                    {data.isPaused ? 'Paused • ' : ''}
                    {`${data.progress}% • ${formatBytes(data.bytesDownloaded)} / ${formatBytes(data.totalBytes)}`}
                  </Text>
                  
                  <View style={[styles.progressBar, { backgroundColor: themeColors.background }]}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { 
                          width: `${data.progress}%`, 
                          backgroundColor: data.isPaused ? '#888888' : '#4a0660' 
                        }
                      ]} 
                    />
                  </View>

                  <View style={styles.controls}>
                    <TouchableOpacity 
                      style={[styles.controlButton, { backgroundColor: themeColors.primary }]}
                      onPress={() => handlePauseResume(name)}
                    >
                      <Ionicons 
                        name={data.isPaused ? "play" : "pause"} 
                        size={20} 
                        color="#fff" 
                      />
                      <Text style={styles.controlButtonText}>
                        {data.isPaused ? 'Resume' : 'Pause'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.controlButton, { backgroundColor: '#ff4444' }]}
                      onPress={() => handleCancel(name)}
                    >
                      <Ionicons name="close" size={20} color="#fff" />
                      <Text style={styles.controlButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  downloadsList: {
    flex: 1,
  },
  downloadItem: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  downloadName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  downloadProgress: {
    fontSize: 14,
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 8,
    minWidth: 100,
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default DownloadsDialog; 