import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { Button, Text, Switch } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { isProjectionModel } from '../utils/multimodalHelpers';
import { DownloadableModel } from './model/DownloadableModelItem';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface VisionDownloadDialogProps {
  visible: boolean;
  onDismiss: () => void;
  model: DownloadableModel;
  onDownload: (includeVision: boolean, projectionFile?: any) => void;
}

const VisionDownloadDialog: React.FC<VisionDownloadDialogProps> = ({
  visible,
  onDismiss,
  model,
  onDownload
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  
  const [includeVision, setIncludeVision] = useState(true);
  const [selectedProjection, setSelectedProjection] = useState<any>(null);

  const projectionFiles = useMemo(() => {
    if (!model?.additionalFiles) return [];
    return model.additionalFiles.filter(file => isProjectionModel(file.name));
  }, [model?.additionalFiles]);

  const handleDownload = () => {
    onDownload(includeVision, selectedProjection);
    onDismiss();
  };

  if (!visible || !model) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              <Text style={[styles.title, { color: themeColors.text }]}>Vision Model Download</Text>
            </View>
            <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <View style={styles.modelInfo}>
              <Text style={[styles.modelName, { color: themeColors.text }]}>
                {model?.name || ''}
              </Text>
              <Text style={[styles.modelSize, { color: themeColors.secondaryText }]}>
                {model?.size || ''}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: themeColors.borderColor }]} />

            <View style={styles.visionToggle}>
              <View style={styles.toggleRow}>
                <MaterialCommunityIcons 
                  name={includeVision ? 'eye' : 'eye-off'} 
                  size={24} 
                  color={includeVision ? themeColors.primary : themeColors.secondaryText}
                />
                <View style={styles.toggleText}>
                  <Text style={[styles.toggleTitle, { color: themeColors.text }]}>
                    Enable Vision Support
                  </Text>
                  <Text style={[styles.toggleSubtitle, { color: themeColors.secondaryText }]}>
                    Download with multimodal projection model
                  </Text>
                </View>
                <Switch
                  value={includeVision}
                  onValueChange={setIncludeVision}
                  color={themeColors.primary}
                />
              </View>
            </View>

            {includeVision && projectionFiles.length > 0 && (
              <>
                <View style={[styles.divider, { backgroundColor: themeColors.borderColor }]} />
                
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  Projection Model
                </Text>
                
                {projectionFiles.map((file: any, index: number) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => setSelectedProjection(selectedProjection === file ? null : file)}
                    style={[styles.projectionItem, { backgroundColor: themeColors.cardBackground }]}
                  >
                    <View style={styles.projectionContent}>
                      <MaterialCommunityIcons 
                        name="eye-settings" 
                        size={24} 
                        color={themeColors.primary}
                        style={styles.projectionIcon}
                      />
                      <View style={styles.projectionInfo}>
                        <Text style={[styles.projectionName, { color: themeColors.text }]}>
                          {file.name}
                        </Text>
                        <Text style={[styles.projectionDescription, { color: themeColors.secondaryText }]}>
                          {file.description || 'Vision projection model'}
                        </Text>
                      </View>
                      <Switch
                        value={selectedProjection === file}
                        onValueChange={(value) => setSelectedProjection(value ? file : null)}
                        color={themeColors.primary}
                      />
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Button 
              mode="text" 
              onPress={onDismiss}
              textColor={themeColors.secondaryText}
            >
              Cancel
            </Button>
            <Button 
              mode="contained" 
              onPress={handleDownload}
              buttonColor={themeColors.primary}
              textColor="#FFFFFF"
            >
              Download
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
};

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
  },
  closeButton: {
    padding: 4,
  },
  contentContainer: {
    maxHeight: Dimensions.get('window').height - 280,
    marginBottom: 16,
  },
  modelInfo: {
    marginBottom: 16,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  modelSize: {
    fontSize: 14,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  visionToggle: {
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggleText: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  toggleSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  projectionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  projectionIcon: {
    marginRight: 12,
  },
  projectionInfo: {
    flex: 1,
    marginRight: 12,
  },
  projectionName: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  projectionDescription: {
    fontSize: 13,
  },
  projectionItem: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.08)',
  },
});

export default VisionDownloadDialog;
