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
import { NativeModules } from 'react-native';
import { llamaManager } from '../utils/LlamaManager';

interface StoredModel {
  name: string;
  path: string;
  size: number;
  modified: string;
}

interface ModelDownloaderType {
  getStoredModels: () => Promise<StoredModel[]>;
}

const ModelDownloaderModule = NativeModules.ModelDownloader as ModelDownloaderType;

// Add this interface for the ref
export interface ModelSelectorRef {
  refreshModels: () => void;
}

interface ModelSelectorProps {
  onModelSelect?: (modelPath: string) => void;
  onModelUnload?: () => void;
}

const ModelSelector = forwardRef<{ refreshModels: () => void }, ModelSelectorProps>(
  ({ onModelSelect, onModelUnload }, ref) => {
    const { theme: currentTheme } = useTheme();
    const themeColors = theme[currentTheme];
    const [modalVisible, setModalVisible] = useState(false);
    const [models, setModels] = useState<StoredModel[]>([]);
    const [selectedModel, setSelectedModel] = useState<string | null>(null);

    const loadModels = async () => {
      try {
        const storedModels = await ModelDownloaderModule.getStoredModels();
        setModels(storedModels);
      } catch (error) {
        console.error('Error loading models:', error);
      }
    };

    useEffect(() => {
      loadModels();
    }, []);

    // Expose the refresh method through the ref
    useImperativeHandle(ref, () => ({
      refreshModels: loadModels
    }));

    const handleModelSelect = async (model: StoredModel) => {
      setModalVisible(false);
      setSelectedModel(model.name);
      if (onModelSelect) {
        onModelSelect(model.path);
      }
    };

    const handleUnloadModel = () => {
      Alert.alert(
        'Unload Model',
        'Are you sure you want to unload the current model?',
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Unload',
            onPress: () => {
              setSelectedModel(null);
              if (onModelUnload) {
                onModelUnload();
              }
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

    const renderModelItem = ({ item }: { item: StoredModel }) => (
      <TouchableOpacity
        style={[
          styles.modelItem,
          { backgroundColor: themeColors.borderColor },
          selectedModel === item.name && styles.selectedModelItem
        ]}
        onPress={() => handleModelSelect(item)}
      >
        <View style={styles.modelIconContainer}>
          <Ionicons 
            name={selectedModel === item.name ? "cube" : "cube-outline"} 
            size={28} 
            color={selectedModel === item.name ? '#4a0660' : themeColors.text} 
          />
        </View>
        <View style={styles.modelInfo}>
          <Text style={[
            styles.modelName, 
            { color: themeColors.text },
            selectedModel === item.name && styles.selectedModelText
          ]}>
            {getDisplayName(item.name)}
          </Text>
          <View style={styles.modelMetaInfo}>
            <Text style={[styles.modelDetails, { color: themeColors.secondaryText }]}>
              {formatBytes(item.size)}
            </Text>
          </View>
        </View>
        {selectedModel === item.name && (
          <View style={styles.selectedIndicator}>
            <Ionicons name="checkmark-circle" size={24} color="#4a0660" />
          </View>
        )}
      </TouchableOpacity>
    );

    return (
      <>
        <TouchableOpacity
          style={[styles.selector, { backgroundColor: themeColors.borderColor }]}
          onPress={() => setModalVisible(true)}
        >
          <View style={styles.selectorContent}>
            <View style={styles.modelIconWrapper}>
              <Ionicons 
                name={selectedModel ? "cube" : "cube-outline"} 
                size={24} 
                color={selectedModel ? '#4a0660' : themeColors.text} 
              />
            </View>
            <View style={styles.selectorTextContainer}>
              <Text style={[styles.selectorLabel, { color: themeColors.secondaryText }]}>
                Active Model
              </Text>
              <Text style={[styles.selectorText, { color: themeColors.text }]}>
                {selectedModel ? getDisplayName(selectedModel) : 'Select a Model'}
              </Text>
            </View>
          </View>
          <View style={styles.selectorActions}>
            {selectedModel && (
              <TouchableOpacity 
                onPress={handleUnloadModel}
                style={styles.unloadButton}
              >
                <Ionicons name="close-circle" size={20} color={themeColors.secondaryText} />
              </TouchableOpacity>
            )}
            <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
          </View>
        </TouchableOpacity>

        <Modal
          visible={modalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                  Select Model
                </Text>
                <TouchableOpacity 
                  onPress={() => setModalVisible(false)}
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
}); 