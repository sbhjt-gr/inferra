import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { getThemeAwareColor, getBrowserDownloadTextColor } from '../../utils/ColorUtils';
import { Dialog, Portal, PaperProvider, Button } from 'react-native-paper';

export interface DownloadableModel {
  name: string;
  description?: string;
  size: string;
  huggingFaceLink: string;
  licenseLink: string;
  modelFamily: string;
  quantization: string;
  tags?: string[];
  additionalFiles?: {
    name: string;
    url: string;
    description?: string;
  }[];
}

interface DownloadableModelItemProps {
  model: DownloadableModel;
  isDownloaded: boolean;
  isDownloading: boolean;
  isInitializing: boolean;
  downloadProgress?: {
    progress: number;
    bytesDownloaded: number;
    totalBytes: number;
    status: string;
  };
  onDownload: (model: DownloadableModel) => void;
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
    console.error('Error formatting bytes:', error, bytes);
    return '0 B';
  }
};

const DownloadableModelItem: React.FC<DownloadableModelItemProps> = ({
  model,
  isDownloaded,
  isDownloading,
  isInitializing,
  downloadProgress,
  onDownload,
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');

  const showDialog = (title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogVisible(true);
  };

  const hideDialog = () => setDialogVisible(false);

  const handleBrowserDownload = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('Error opening URL:', error);
      showDialog('Error', 'Could not open the download link');
    }
  };

  return (
    <>
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
                <View style={[styles.modelFamily, { backgroundColor: getThemeAwareColor('#4a0660', currentTheme) }]}>
                  <Text style={styles.modelFamilyText}>{model.modelFamily}</Text>
                </View>
                <View style={[styles.modelQuantization, { backgroundColor: getThemeAwareColor('#2c7fb8', currentTheme) }]}>
                  <Text style={styles.modelQuantizationText}>{model.quantization}</Text>
                </View>
                {model.tags?.includes('fastest') && (
                  <View style={[styles.modelTag, { backgroundColor: getThemeAwareColor('#00a67e', currentTheme) }]}>
                    <MaterialCommunityIcons name="flash" size={12} color={themeColors.headerText} style={{ marginRight: 4 }} />
                    <Text style={styles.modelTagText}>Fastest</Text>
                  </View>
                )}
                {model.tags?.includes('recommended') && (
                  <View style={[styles.modelTag, { backgroundColor: getThemeAwareColor('#FF8C00', currentTheme) }]}>
                    <MaterialCommunityIcons name="star" size={12} color={themeColors.headerText} style={{ marginRight: 4 }} />
                    <Text style={styles.modelTagText}>Recommended</Text>
                  </View>
                )}
                {model.tags?.includes('vision') && (
                  <View style={[styles.modelTag, { backgroundColor: getThemeAwareColor('#9C27B0', currentTheme) }]}>
                    <MaterialCommunityIcons name="eye" size={12} color={themeColors.headerText} style={{ marginRight: 4 }} />
                    <Text style={styles.modelTagText}>Vision</Text>
                  </View>
                )}
                {isDownloaded && (
                  <View style={[styles.modelTag, { backgroundColor: getThemeAwareColor('#666', currentTheme) }]}>
                    <MaterialCommunityIcons name="check" size={12} color={themeColors.headerText} style={{ marginRight: 4 }} />
                    <Text style={styles.modelTagText}>Downloaded</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.downloadButtonsContainer}>
              <TouchableOpacity
                style={[
                  styles.downloadButton, 
                  { backgroundColor: '#4a0660' },
                  (isDownloading || isInitializing || isDownloaded) && { opacity: 0.5 }
                ]}
                onPress={() => onDownload(model)}
                disabled={isDownloading || isInitializing || isDownloaded}
              >
                <MaterialCommunityIcons 
                  name={
                    isDownloaded
                      ? "check"
                      : isInitializing 
                        ? "sync" 
                        : isDownloading
                          ? "timer-sand" 
                          : "cloud-download"
                  } 
                  size={20} 
                  color="#fff" 
                />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.modelMetaInfo}>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="disc" size={16} color={themeColors.secondaryText} />
              <Text style={[styles.metaText, { color: themeColors.secondaryText }]}>
                {model.size}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.browserDownloadButton}
              onPress={() => handleBrowserDownload(model.huggingFaceLink)}
            >
              <MaterialCommunityIcons name="open-in-new" size={14} color={getBrowserDownloadTextColor(currentTheme)} style={{ marginRight: 4 }} />
              <Text style={[styles.browserDownloadText, { color: getBrowserDownloadTextColor(currentTheme) }]}>Download in browser</Text>
            </TouchableOpacity>
          </View>
          
          {model.description && (
            <Text style={[styles.modelDescription, { color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.75)' }]}>
              {model.description}
            </Text>
          )}
          
          {model.additionalFiles && model.additionalFiles.length > 0 && (
            <Text style={[styles.additionalFilesNote, { color: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)' }]}>
              <MaterialCommunityIcons name="information-outline" size={14} color={currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)'} />
              {' '}This download includes {model.additionalFiles.length} additional file{model.additionalFiles.length > 1 ? 's' : ''}: {model.additionalFiles.map(file => file.name.split('.')[0]).join(', ')}
            </Text>
          )}
          
          {model.licenseLink && (
            <TouchableOpacity
              style={styles.licenseButtonBottomLeft}
              onPress={() => handleBrowserDownload(model.licenseLink)}
            >
              <MaterialCommunityIcons name="file-document-outline" size={14} color={getBrowserDownloadTextColor(currentTheme)} style={{ marginRight: 4 }} />
              <Text style={[styles.licenseButtonText, { color: getBrowserDownloadTextColor(currentTheme) }]}>License</Text>
            </TouchableOpacity>
          )}
          
          {downloadProgress && downloadProgress.status !== 'completed' && downloadProgress.status !== 'failed' && (
            <View style={styles.downloadProgress}>
              <Text style={[styles.modelDetails, { color: themeColors.secondaryText }]}>
                {getProgressText(downloadProgress)}
              </Text>
              <View style={[styles.progressBar, { backgroundColor: themeColors.background }]}>
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      width: `${downloadProgress.progress}%`, 
                      backgroundColor: '#4a0660' 
                    }
                  ]} 
                />
              </View>
            </View>
          )}
        </View>
      </View>

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={hideDialog}>
          <Dialog.Title>{dialogTitle}</Dialog.Title>
          <Dialog.Content>
            <Text>{dialogMessage}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={hideDialog}>OK</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

const styles = StyleSheet.create({
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
  downloadButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  browserDownloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  browserDownloadText: {
    fontSize: 13,
    fontWeight: '500',
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
  modelDescription: {
    marginTop: 4,
    marginBottom: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  downloadProgress: {
    marginTop: 12,
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
  modelTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  modelTagText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  modelDetails: {
    fontSize: 14,
    opacity: 0.7,
  },
  additionalFilesNote: {
    marginTop: 4,
    marginBottom: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  licenseButtonBottomLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  licenseButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

export default DownloadableModelItem; 