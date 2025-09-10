import React from 'react';
import { 
  Modal, 
  TouchableOpacity, 
  View, 
  Text, 
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { getThemeAwareColor } from '../../utils/ColorUtils';

interface ModelDownloadsDialogProps {
  visible: boolean;
  onClose: () => void;
  downloads: any;
  onCancelDownload: (modelName: string) => Promise<void>;
}

const getProgressText = (data: any) => {
  if (!data) return '0% • 0 B / 0 B';
  
  const progress = typeof data.progress === 'number' ? data.progress : 0;
  const bytesDownloaded = typeof data.bytesDownloaded === 'number' ? data.bytesDownloaded : 0;
  const totalBytes = typeof data.totalBytes === 'number' && data.totalBytes > 0 ? data.totalBytes : 0;
  
  const downloadedFormatted = formatBytes(bytesDownloaded);
  const totalFormatted = formatBytes(totalBytes);
  
  return `${progress}% • ${downloadedFormatted} / ${totalFormatted}`;
};

const formatBytes = (bytes?: number) => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 B';
  try {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i < 0 || i >= sizes.length || !isFinite(bytes)) return '0 B';
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  } catch (error) {
    return '0 B';
  }
};

const ModelDownloadsDialog: React.FC<ModelDownloadsDialogProps> = ({ 
  visible, 
  onClose, 
  downloads,
  onCancelDownload
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];

  const activeDownloads = Object.entries(downloads).filter(([_, value]) => {
    const downloadValue = value as any;
    return downloadValue.status !== 'completed' && downloadValue.status !== 'failed';
  });

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
              <MaterialCommunityIcons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>
          
          {activeDownloads.length === 0 ? (
            <Text style={styles.emptyText}>
              No active downloads
            </Text>
          ) : (
            activeDownloads.map(([name, dataValue]) => {
              const data = dataValue as any;
              return (
                <View key={name} style={styles.downloadItem}>
                  <View style={styles.downloadItemHeader}>
                    <Text style={[styles.downloadItemName, { color: themeColors.text }]}>
                      {name}
                    </Text>
                    <TouchableOpacity 
                      style={styles.cancelDownloadButton}
                      onPress={() => onCancelDownload(name)}
                    >
                      <MaterialCommunityIcons 
                        name="close-circle" 
                        size={24} 
                        color={getThemeAwareColor('#ff4444', currentTheme)} 
                      />
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
              );
            })
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
    marginBottom: 8,
  },
  downloadItemName: {
    fontSize: 16,
    fontWeight: '500',
  },
  downloadItemProgress: {
    fontSize: 14,
    marginBottom: 8,
  },
  cancelDownloadButton: {
    padding: 4,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    width: '100%',
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    marginTop: 8,
  },
});

export default ModelDownloadsDialog; 
