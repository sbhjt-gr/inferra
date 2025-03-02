import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  NativeModules,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';

interface DownloadInfo {
  id: number;
  name: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: string;
}

interface DownloadManagerRef {
  addDownload: (downloadId: number, name: string) => void;
}

interface DownloadManagerProps {
  visible: boolean;
  onClose: () => void;
}

const DownloadManager = forwardRef<DownloadManagerRef, DownloadManagerProps>(
  ({ visible, onClose }, ref) => {
    const { theme: currentTheme } = useTheme();
    const themeColors = theme[currentTheme];
    const [downloads, setDownloads] = useState<Map<number, DownloadInfo>>(new Map());
    const [isChecking, setIsChecking] = useState(false);
    const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useImperativeHandle(ref, () => ({
      addDownload: (downloadId: number, name: string) => {
        console.log('Adding download:', downloadId, name); // Debug log
        setDownloads(prev => {
          const newDownloads = new Map(prev);
          newDownloads.set(downloadId, {
            id: downloadId,
            name,
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: 0,
            status: 'starting'
          });
          return newDownloads;
        });
        startChecking();
      }
    }));

    const startChecking = () => {
      if (!isChecking) {
        setIsChecking(true);
        if (!checkIntervalRef.current) {
          checkDownloads();
          checkIntervalRef.current = setInterval(checkDownloads, 1000);
        }
      }
    };

    const stopChecking = () => {
      setIsChecking(false);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };

    const checkDownloads = async () => {
      console.log('Checking downloads, count:', downloads.size); // Debug log
      if (downloads.size === 0) {
        stopChecking();
        return;
      }

      const updatedDownloads = new Map(downloads);
      let hasActiveDownloads = false;

      for (const [id, info] of downloads.entries()) {
        try {
          const status = await NativeModules.ModelDownloader.checkDownloadStatus(id);
          console.log('Download status:', id, status); // Debug log
          
          if (status.status === 'failed' || status.status === 'completed') {
            // Remove completed or failed downloads
            updatedDownloads.delete(id);
            continue;
          }

          if (status.bytesDownloaded && status.totalBytes) {
            const progress = Math.round((status.bytesDownloaded / status.totalBytes) * 100);
            
            if (progress < 100) {
              hasActiveDownloads = true;
            } else {
              // If progress is 100% but status isn't 'completed', mark it as completed
              // and remove it from active downloads
              updatedDownloads.delete(id);
              continue;
            }

            updatedDownloads.set(id, {
              ...info,
              progress,
              bytesDownloaded: status.bytesDownloaded,
              totalBytes: status.totalBytes,
              status: status.status
            });
          } else if (status.status === 'unknown') {
            // If status is unknown and we can't get progress info, consider it inactive
            updatedDownloads.delete(id);
          } else {
            // Keep the download in the list but update its status
            updatedDownloads.set(id, {
              ...info,
              status: status.status
            });
            hasActiveDownloads = true;
          }
        } catch (error) {
          console.error(`Error checking download ${id}:`, error);
          updatedDownloads.delete(id);
        }
      }

      setDownloads(updatedDownloads);
      
      if (!hasActiveDownloads) {
        stopChecking();
      }
    };

    // Clean up on unmount
    useEffect(() => {
      return () => {
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
        }
      };
    }, []);

    // Start checking when downloads are added
    useEffect(() => {
      if (downloads.size > 0 && !isChecking) {
        startChecking();
      }
    }, [downloads.size, isChecking]);

    const cancelDownload = async (downloadId: number) => {
      try {
        await NativeModules.ModelDownloader.cancelDownload(downloadId);
        setDownloads(prev => {
          const newDownloads = new Map(prev);
          newDownloads.delete(downloadId);
          return newDownloads;
        });
      } catch (error) {
        console.error('Error canceling download:', error);
        Alert.alert('Error', 'Failed to cancel download');
      }
    };

    const formatBytes = (bytes: number) => {
      if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
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
              <Text style={[styles.title, { color: themeColors.text }]}>Downloads</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.downloadsList}>
              {downloads.size === 0 ? (
                <Text style={[styles.emptyText, { color: themeColors.secondaryText }]}>
                  No active downloads
                </Text>
              ) : (
                Array.from(downloads.values()).map(download => (
                  <View key={download.id} style={styles.downloadItem}>
                    <View style={styles.downloadHeader}>
                      <Text style={[styles.downloadName, { color: themeColors.text }]}>
                        {download.name}
                      </Text>
                      <TouchableOpacity 
                        onPress={() => cancelDownload(download.id)}
                        style={styles.actionButton}
                      >
                        <Ionicons name="close-circle" size={24} color="#ff4444" />
                      </TouchableOpacity>
                    </View>
                    
                    <Text style={[styles.downloadProgress, { color: themeColors.secondaryText }]}>
                      {`${download.progress || 0}% • ${formatBytes(download.bytesDownloaded || 0)} / ${formatBytes(download.totalBytes || 0)}`}
                    </Text>
                    
                    <View style={[styles.progressBar, { backgroundColor: themeColors.borderColor }]}>
                      <View 
                        style={[
                          styles.progressFill, 
                          { width: `${download.progress || 0}%`, backgroundColor: '#4a0660' }
                        ]} 
                      />
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </View>
      </Modal>
    );
  }
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
    paddingBottom: 20,
  },
  downloadItem: {
    marginBottom: 16,
  },
  downloadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  downloadName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  downloadProgress: {
    fontSize: 14,
    marginBottom: 8,
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
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    marginTop: 20,
  },
  downloadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
});

export default DownloadManager; 