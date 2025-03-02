import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
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
                  <View style={styles.downloadHeader}>
                    <Text style={[styles.downloadName, { color: themeColors.text }]}>
                      {name}
                    </Text>
                    <TouchableOpacity 
                      onPress={() => handleCancel(name)}
                      style={styles.cancelButton}
                    >
                      <Ionicons name="close-circle" size={24} color="#ff4444" />
                    </TouchableOpacity>
                  </View>
                  
                  <Text style={[styles.downloadProgress, { color: themeColors.secondaryText }]}>
                    {`${data.progress}% • ${formatBytes(data.bytesDownloaded)} / ${formatBytes(data.totalBytes)}`}
                  </Text>
                  
                  <View style={[styles.progressBar, { backgroundColor: themeColors.background }]}>
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
  downloadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  downloadName: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
    marginRight: 12,
  },
  downloadProgress: {
    fontSize: 14,
    marginBottom: 8,
  },
  cancelButton: {
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
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default DownloadsDialog; 