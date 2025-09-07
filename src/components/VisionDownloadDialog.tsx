import React, { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Dialog, Portal, Button, Text, Switch, List, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { getMmprojFiles } from '../utils/multimodalHelpers';
import { formatBytes } from '../utils/ModelUtils';
import { DownloadableModel } from './model/DownloadableModelItem';

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
    // Filter for mmproj files based on filename pattern
    return model.additionalFiles.filter(file => 
      file.name.toLowerCase().includes('mmproj') && file.name.endsWith('.gguf')
    );
  }, [model?.additionalFiles]);

  const handleDownload = () => {
    onDownload(includeVision, selectedProjection);
    onDismiss();
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.title}>
          Vision Model Download
        </Dialog.Title>
        
        <Dialog.Content>
          <View style={styles.modelInfo}>
            <Text style={[styles.modelName, { color: themeColors.text }]}>
              {model?.name || ''}
            </Text>
            <Text style={[styles.modelSize, { color: themeColors.secondaryText }]}>
              {model?.size || ''}
            </Text>
          </View>

          <Divider style={styles.divider} />

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
              <Divider style={styles.divider} />
              
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                Projection Model
              </Text>
              
              {projectionFiles.map((file, index) => (
                <List.Item
                  key={index}
                  title={file.name}
                  description={file.description || 'Projection model file'}
                  left={() => (
                    <MaterialCommunityIcons 
                      name="eye-settings" 
                      size={24} 
                      color={themeColors.primary}
                      style={styles.projectionIcon}
                    />
                  )}
                  right={() => (
                    <Switch
                      value={selectedProjection === file}
                      onValueChange={(value) => setSelectedProjection(value ? file : null)}
                      color={themeColors.primary}
                    />
                  )}
                  onPress={() => setSelectedProjection(selectedProjection === file ? null : file)}
                  style={[styles.projectionItem, { backgroundColor: themeColors.cardBackground }]}
                />
              ))}
            </>
          )}
        </Dialog.Content>

        <Dialog.Actions>
          <Button onPress={onDismiss} textColor={themeColors.secondaryText}>
            Cancel
          </Button>
          <Button mode="contained" onPress={handleDownload}>
            Download
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '80%',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
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
  projectionItem: {
    borderRadius: 8,
    marginBottom: 8,
  },
  projectionIcon: {
    alignSelf: 'center',
    marginLeft: 8,
  },
});

export default VisionDownloadDialog;