import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, ScrollView, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Chip, Button } from 'react-native-paper';
import { HFModelDetails, HFFile } from '../services/HuggingFaceService';
import { huggingFaceService } from '../services/HuggingFaceService';

interface ModelFilesDialogProps {
  visible: boolean;
  onClose: () => void;
  modelDetails: HFModelDetails | null;
  onDownloadFile: (filename: string, downloadUrl: string) => Promise<void>;
  isDownloading?: boolean;
}

export default function ModelFilesDialog({
  visible,
  onClose,
  modelDetails,
  onDownloadFile,
  isDownloading = false,
}: ModelFilesDialogProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  if (!visible || !modelDetails) return null;

  const handleDownload = async (filename: string, downloadUrl: string) => {
    setDownloadingFile(filename);
    try {
      await onDownloadFile(filename, downloadUrl);
    } finally {
      setDownloadingFile(null);
    }
  };

  const renderFileItem = (file: HFFile, index: number) => {
    const isCurrentlyDownloading = downloadingFile === file.filename;

    return (
      <View key={index} style={styles.fileItem}>
        <View style={styles.fileHeader}>
          <Text style={[styles.fileName, { color: themeColors.text }]} numberOfLines={2}>
            {file.filename}
          </Text>
        </View>

        <View style={styles.fileInfo}>
          <View style={styles.fileDetails}>
            <Chip
              mode="flat"
              style={[styles.fileChip, styles.sizeChip]}
              textStyle={styles.chipText}
              icon="download"
            >
              {huggingFaceService.formatModelSize(file.size)}
            </Chip>
            <Chip
              mode="flat"
              style={[styles.fileChip, styles.quantChip]}
              textStyle={styles.chipText}
              icon="cog"
            >
              {huggingFaceService.extractQuantization(file.filename)}
            </Chip>
            {modelDetails?.hasVision && file.filename.toLowerCase().includes('mmproj') && (
              <Chip
                mode="flat"
                style={[styles.fileChip, styles.projectionChip]}
                textStyle={styles.chipText}
                icon="eye-settings"
              >
                Projection
              </Chip>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.downloadButton,
              {
                backgroundColor: isCurrentlyDownloading ? themeColors.primary + '60' : themeColors.primary,
              },
            ]}
            onPress={() => handleDownload(file.filename, file.downloadUrl)}
            disabled={isCurrentlyDownloading}
          >
            {isCurrentlyDownloading ? (
              <ActivityIndicator size="small" color="#FFFFFF" style={styles.loadingIcon} />
            ) : (
              <MaterialCommunityIcons name="download" size={20} color="#FFFFFF" style={styles.buttonIcon} />
            )}
            <Text style={styles.downloadButtonText}>
              {isCurrentlyDownloading ? 'Downloading...' : 'Download'}
            </Text>
          </TouchableOpacity>
        </View>

        {index < modelDetails.files.length - 1 && (
          <View style={[styles.fileDivider, { backgroundColor: themeColors.borderColor }]} />
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              <Text style={[styles.title, { color: themeColors.text }]}>{modelDetails.id}</Text>
              {modelDetails.hasVision && (
                <View style={styles.visionBadge}>
                  <Text style={styles.visionBadgeText}>👁 Vision</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.filesHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Available Model Files</Text>
            <Text style={[styles.sectionSubtitle, { color: themeColors.secondaryText }]}>
              {modelDetails.files.length} file{modelDetails.files.length !== 1 ? 's' : ''} available
            </Text>
          </View>

          <ScrollView
            style={styles.filesList}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {modelDetails.files.map((file, index) => renderFileItem(file, index))}
          </ScrollView>

          <View style={styles.footer}>
            <Button mode="text" onPress={onClose} style={styles.closeActionButton}>
              <Text style={[styles.closeActionText, { color: themeColors.primary }]}>Close</Text>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: Dimensions.get('window').width - 48,
    borderRadius: 16,
    padding: 24,
    maxHeight: Dimensions.get('window').height - 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  visionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(123, 44, 191, 0.1)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  visionBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#7B2CBF',
  },
  closeButton: {
    padding: 4,
  },
  filesHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    marginBottom: 4,
  },
  filesList: {
    maxHeight: Dimensions.get('window').height - 360,
    marginBottom: 16,
  },
  fileItem: {
    paddingVertical: 16,
  },
  fileHeader: {
    marginBottom: 12,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  fileInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fileDetails: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
    marginRight: 12,
    flexWrap: 'wrap',
  },
  fileChip: {
    height: 28,
  },
  sizeChip: {
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
  },
  quantChip: {
    backgroundColor: 'rgba(25, 118, 210, 0.1)',
  },
  projectionChip: {
    backgroundColor: 'rgba(123, 44, 191, 0.1)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 90,
  },
  buttonIcon: {
    marginRight: 4,
  },
  loadingIcon: {
    marginRight: 4,
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  fileDivider: {
    height: 1,
    marginTop: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.08)',
  },
  closeActionButton: {
    minWidth: 80,
  },
  closeActionText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
