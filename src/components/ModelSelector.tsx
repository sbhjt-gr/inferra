import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { modelDownloader } from '../services/ModelDownloader';
import { ThemeType, ThemeColors } from '../types/theme';
import { useModel } from '../context/ModelContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getThemeAwareColor } from '../utils/ColorUtils';

interface StoredModel {
  name: string;
  path: string;
  size: number;
  modified: string;
}

interface ModelDownloaderType {
  getStoredModels: () => Promise<StoredModel[]>;
}

// Add this interface for the ref
export interface ModelSelectorRef {
  refreshModels: () => void;
}

interface ModelSelectorProps {
  isOpen?: boolean;
  onClose?: () => void;
  preselectedModelPath?: string | null;
  isGenerating?: boolean;
}

const ModelSelector = forwardRef<{ refreshModels: () => void }, ModelSelectorProps>(
  ({ isOpen, onClose, preselectedModelPath, isGenerating }, ref) => {
    const { theme: currentTheme } = useTheme();
    const themeColors = theme[currentTheme as ThemeColors];
    const [modalVisible, setModalVisible] = useState(false);
    const [models, setModels] = useState<StoredModel[]>([]);
    const { selectedModelPath, isModelLoading, loadModel, unloadModel } = useModel();

    const loadModels = async () => {
      try {
        const storedModels = await modelDownloader.getStoredModels();
        // Filter out any models that are still being downloaded
        const downloadStates = await AsyncStorage.getItem('active_downloads');
        const activeDownloads = downloadStates ? JSON.parse(downloadStates) : {};
        
        // Only show models that are not currently being downloaded
        const completedModels = storedModels.filter(model => {
          const isDownloading = Object.values(activeDownloads).some(
            (download: any) => 
              download.filename === model.name && 
              download.status !== 'completed'
          );
          return !isDownloading;
        });
        
        setModels(completedModels);
      } catch (error) {
        console.error('Error loading models:', error);
      }
    };

    useEffect(() => {
      loadModels();
    }, []);

    // Add effect to refresh models when downloads change
    useEffect(() => {
      const checkDownloads = async () => {
        const downloadStates = await AsyncStorage.getItem('active_downloads');
        if (downloadStates) {
          const downloads = JSON.parse(downloadStates);
          // If any download just completed, refresh the model list
          const hasCompletedDownload = Object.values(downloads).some(
            (download: any) => download.status === 'completed'
          );
          if (hasCompletedDownload) {
            loadModels();
          }
        }
      };

      // Check downloads every 2 seconds
      const interval = setInterval(checkDownloads, 2000);
      return () => clearInterval(interval);
    }, []);

    // Expose the refresh method through the ref
    useImperativeHandle(ref, () => ({
      refreshModels: loadModels
    }));

    const handleModelSelect = async (model: StoredModel) => {
      if (isGenerating) {
        Alert.alert(
          'Model In Use',
          'Cannot change model while generating a response. Please wait for the current generation to complete or cancel it.'
        );
        return;
      }
      setModalVisible(false);
      await loadModel(model.path);
    };

    const handleUnloadModel = () => {
      Alert.alert(
        'Unload Model',
        isGenerating 
          ? 'This will stop the current generation. Are you sure you want to unload the model?'
          : 'Are you sure you want to unload the current model?',
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Unload',
            onPress: async () => {
              await unloadModel();
            },
            style: 'destructive'
          }
        ]
      );
    };

    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B ', 'KB ', 'MB ', 'GB '];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };

    const getDisplayName = (filename: string) => {
      // Remove file extension
      return filename.split('.')[0];
    };

    const getModelNameFromPath = (path: string | null, models: StoredModel[]): string => {
      if (!path) return 'Select a Model';
      const model = models.find(m => m.path === path);
      return model ? getDisplayName(model.name) : getDisplayName(path.split('/').pop() || '');
    };

    const renderModelItem = ({ item }: { item: StoredModel }) => (
      <TouchableOpacity
        style={[
          styles.modelItem,
          { backgroundColor: themeColors.borderColor },
          selectedModelPath === item.path && styles.selectedModelItem,
          isGenerating && styles.modelItemDisabled
        ]}
        onPress={() => handleModelSelect(item)}
        disabled={isGenerating}
      >
        <View style={styles.modelIconContainer}>
          <Ionicons 
            name={selectedModelPath === item.path ? "cube" : "cube-outline"} 
            size={28} 
            color={selectedModelPath === item.path ? 
              getThemeAwareColor('#4a0660', currentTheme) : 
              themeColors.text} 
          />
        </View>
        <View style={styles.modelInfo}>
          <Text style={[
            styles.modelName, 
            { color: themeColors.text },
            selectedModelPath === item.path && { color: getThemeAwareColor('#4a0660', currentTheme) }
          ]}>
            {getDisplayName(item.name)}
          </Text>
          <View style={styles.modelMetaInfo}>
            <Text style={[styles.modelDetails, { color: themeColors.secondaryText }]}>
              {formatBytes(item.size)}
            </Text>
          </View>
        </View>
        {selectedModelPath === item.path && (
          <View style={styles.selectedIndicator}>
            <Ionicons name="checkmark-circle" size={24} color={getThemeAwareColor('#4a0660', currentTheme)} />
          </View>
        )}
      </TouchableOpacity>
    );

    // Add effect to handle isOpen prop
    useEffect(() => {
      if (isOpen !== undefined) {
        setModalVisible(isOpen);
      }
    }, [isOpen]);

    // Update modal close handler
    const handleModalClose = () => {
      setModalVisible(false);
      onClose?.();
    };

    // Add effect to handle preselected model
    useEffect(() => {
      if (preselectedModelPath && models.length > 0) {
        const preselectedModel = models.find(model => model.path === preselectedModelPath);
        if (preselectedModel) {
          handleModelSelect(preselectedModel);
        }
      }
    }, [preselectedModelPath, models]);

    // Add effect to close modal if generation starts
    useEffect(() => {
      if (isGenerating && modalVisible) {
        setModalVisible(false);
      }
    }, [isGenerating]);

    return (
      <>
        <TouchableOpacity
          style={[
            styles.selector, 
            { backgroundColor: themeColors.borderColor },
            (isGenerating || isModelLoading) && styles.selectorDisabled
          ]}
          onPress={() => {
            if (isGenerating) {
              Alert.alert(
                'Model In Use',
                'Cannot change model while generating a response. Please wait for the current generation to complete or cancel it.'
              );
              return;
            }
            setModalVisible(true);
          }}
          disabled={isModelLoading || isGenerating}
        >
          <View style={styles.selectorContent}>
            <View style={styles.modelIconWrapper}>
              {isModelLoading ? (
                <ActivityIndicator size="small" color={getThemeAwareColor('#4a0660', currentTheme)} />
              ) : (
                <Ionicons 
                  name={selectedModelPath ? "cube" : "cube-outline"} 
                  size={24} 
                  color={selectedModelPath ? 
                    getThemeAwareColor('#4a0660', currentTheme) : 
                    themeColors.text} 
                />
              )}
            </View>
            <View style={styles.selectorTextContainer}>
              <Text style={[styles.selectorLabel, { color: themeColors.secondaryText }]}>
                Active Model
              </Text>
              <Text style={[styles.selectorText, { color: themeColors.text }]}>
                {isModelLoading 
                  ? 'Loading...' 
                  : getModelNameFromPath(selectedModelPath, models)
                }
              </Text>
            </View>
          </View>
          <View style={styles.selectorActions}>
            {selectedModelPath && !isModelLoading && (
              <TouchableOpacity 
                onPress={handleUnloadModel}
                style={[
                  styles.unloadButton,
                  isGenerating && styles.unloadButtonActive
                ]}
              >
                <Ionicons 
                  name="close-circle" 
                  size={20} 
                  color={isGenerating ? 
                    getThemeAwareColor('#d32f2f', currentTheme) : 
                    themeColors.secondaryText} 
                />
              </TouchableOpacity>
            )}
            <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
          </View>
        </TouchableOpacity>

        <Modal
          visible={modalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={handleModalClose}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                  Select Model
                </Text>
                <TouchableOpacity 
                  onPress={handleModalClose}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color={themeColors.text} />
                </TouchableOpacity>
              </View>

              <FlatList
                data={models}
                renderItem={renderModelItem}
                keyExtractor={item => item.path}
                contentContainerStyle={styles.modelList}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="cube-outline" size={48} color={themeColors.secondaryText} />
                    <Text style={[styles.emptyText, { color: themeColors.secondaryText }]}>
                      No models found. Go to Models → Download Models screen to download a Model.
                    </Text>
                  </View>
                }
              />
            </View>
          </View>
        </Modal>
      </>
    );
  }
);

export default ModelSelector;

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
  },
  selectorContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modelIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  selectorTextContainer: {
    flex: 1,
  },
  selectorText: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unloadButton: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
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
  closeButton: {
    padding: 8,
  },
  modelList: {
    paddingBottom: 20,
  },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  selectedModelItem: {
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
  },
  modelIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modelInfo: {
    flex: 1,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  selectedModelText: {
    color: '#4a0660',
    fontWeight: '600',
  },
  modelMetaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modelDetails: {
    fontSize: 14,
  },
  modelTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
  },
  modelTypeText: {
    fontSize: 12,
    color: '#4a0660',
    fontWeight: '500',
  },
  selectedIndicator: {
    marginLeft: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
  },
  selectorDisabled: {
    opacity: 0.6,
  },
  modelItemDisabled: {
    opacity: 0.6,
  },
  unloadButtonActive: {
    backgroundColor: 'rgba(211, 47, 47, 0.1)',
    borderRadius: 12,
    padding: 4,
  },
}); 