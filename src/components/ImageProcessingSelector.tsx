import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, Button, Dialog, Portal } from 'react-native-paper';
import { useTheme } from '../context/ThemeContext';
import { useModel } from '../context/ModelContext';
import { theme } from '../constants/theme';
import { getThemeAwareColor } from '../utils/ColorUtils';
import { ImageProcessingMode } from '../utils/ImageProcessingUtils';
import { modelDownloader } from '../services/ModelDownloader';

interface StoredModel {
  name: string;
  path: string;
  size: number;
  modified: string;
}

type ImageProcessingSelectorProps = {
  selectedMode: ImageProcessingMode;
  onModeChange: (mode: ImageProcessingMode) => void;
  onMultimodalReady?: () => void;
  disabled?: boolean;
  useRag?: boolean;
  onToggleRag?: (value: boolean) => void;
  ragEnabled?: boolean;
  ragToggleDisabled?: boolean;
};

export default function ImageProcessingSelector({
  selectedMode,
  onModeChange,
  onMultimodalReady,
  disabled = false,
  useRag = true,
  onToggleRag,
  ragEnabled = true,
  ragToggleDisabled = false,
}: ImageProcessingSelectorProps) {
  const [mmProjSelectorVisible, setMmProjSelectorVisible] = useState(false);
  const [storedModels, setStoredModels] = useState<StoredModel[]>([]);
  const [isLoadingProjector, setIsLoadingProjector] = useState(false);
  
  const { theme: currentTheme } = useTheme();
  const { selectedModelPath, loadModel, isMultimodalEnabled } = useModel();
  const themeColors = theme[currentTheme as 'light' | 'dark'];
  const isDark = currentTheme === 'dark';

  useEffect(() => {
    if (onToggleRag) {
      onToggleRag(ragEnabled);
    }
  }, [onToggleRag, ragEnabled]);

  const loadStoredModels = async () => {
    try {
      const models = await modelDownloader.getStoredModels();
      const projectorModels = models.filter(model => 
        model.name.toLowerCase().includes('proj') || 
        model.name.toLowerCase().includes('mmproj') ||
        model.name.toLowerCase().includes('vision')
      );
      setStoredModels(projectorModels);
    } catch (error) {
      setStoredModels([]);
    }
  };

  const handleModePress = async (mode: ImageProcessingMode) => {
    if (disabled || mode === null) return;
    
    if (mode === 'multimodal') {
      if (!selectedModelPath) {
        return;
      }
      
      const isOnlineModel = ['gemini', 'chatgpt', 'deepseek', 'claude', 'apple-foundation'].includes(selectedModelPath);
      
      if (isOnlineModel) {
        onModeChange('multimodal');
        onMultimodalReady?.();
        return;
      }
      
      if (!isMultimodalEnabled) {
        await loadStoredModels();
        setMmProjSelectorVisible(true);
        return;
      }
      
      onModeChange('multimodal');
      onMultimodalReady?.();
    } else if (mode === 'ocr') {
      onModeChange('ocr');
    }
  };

  const handleProjectorSelect = async (projectorModel: StoredModel) => {
    if (!selectedModelPath) return;
    
    try {
      setIsLoadingProjector(true);
      const success = await loadModel(selectedModelPath, projectorModel.path);
      
      if (success) {
        onModeChange('multimodal');
        onMultimodalReady?.();
      }
    } catch (error) {
    } finally {
      setIsLoadingProjector(false);
      setMmProjSelectorVisible(false);
    }
  };

  const handleProjectorSkip = () => {
    setMmProjSelectorVisible(false);
    onModeChange('ocr');
  };

  const handleProjectorSelectorClose = () => {
    setMmProjSelectorVisible(false);
  };

  const getModeDescription = (mode: ImageProcessingMode): string => {
    switch (mode) {
      case 'ocr':
        return 'Extract text from the image';
      case 'multimodal':
        const isOnlineModel = selectedModelPath && ['gemini', 'chatgpt', 'deepseek', 'claude', 'apple-foundation'].includes(selectedModelPath);
        return isOnlineModel ? 'Analyze image content with AI' : 'Analyze image content with AI vision';
      case null:
      default:
        return '';
    }
  };

  const canUseMultimodal = (): boolean => {
    if (!selectedModelPath) return false;
    
    const isOnlineModel = ['gemini', 'chatgpt', 'deepseek', 'claude', 'apple-foundation'].includes(selectedModelPath);
    if (isOnlineModel) {
      return selectedModelPath !== 'deepseek' && selectedModelPath !== 'apple-foundation';
    }
    
    return isMultimodalEnabled;
  };

  const getMultimodalTitle = (): string => {
    if (!selectedModelPath) return 'Vision Analysis';
    
    const isOnlineModel = ['gemini', 'chatgpt', 'deepseek', 'claude', 'apple-foundation'].includes(selectedModelPath);
    return isOnlineModel ? 'Vision Analysis' : 'Multimodal (AI Vision)';
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: themeColors.text }]}>
        Processing Mode
      </Text>
      
      <View style={styles.modeOptions}>
        <TouchableOpacity
          style={[
            styles.modeOption,
            {
              backgroundColor: selectedMode === 'ocr' 
                ? getThemeAwareColor('#4a0660', currentTheme)
                : isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
              borderColor: selectedMode === 'ocr'
                ? getThemeAwareColor('#4a0660', currentTheme)
                : isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              opacity: disabled ? 0.5 : 1,
            }
          ]}
          onPress={() => handleModePress('ocr')}
          disabled={disabled}
        >
          <View style={[
            styles.modeIcon,
            {
              backgroundColor: selectedMode === 'ocr' ? '#ffffff' : getThemeAwareColor('#4a0660', currentTheme)
            }
          ]}>
            <MaterialCommunityIcons
              name="text-recognition"
              size={20}
              color={selectedMode === 'ocr' ? getThemeAwareColor('#4a0660', currentTheme) : '#ffffff'}
            />
          </View>
          <View style={styles.modeContent}>
            <Text style={[
              styles.modeTitle,
              { color: selectedMode === 'ocr' ? '#ffffff' : themeColors.text }
            ]}>
              OCR (Text Extraction)
            </Text>
            <Text style={[
              styles.modeDescription,
              { color: selectedMode === 'ocr' ? 'rgba(255, 255, 255, 0.8)' : themeColors.secondaryText }
            ]}>
              {getModeDescription('ocr')}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeOption,
            {
              backgroundColor: selectedMode === 'multimodal' 
                ? getThemeAwareColor('#4a0660', currentTheme)
                : isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
              borderColor: selectedMode === 'multimodal'
                ? getThemeAwareColor('#4a0660', currentTheme)
                : isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              opacity: disabled || !canUseMultimodal() ? 0.5 : 1,
            }
          ]}
          onPress={() => handleModePress('multimodal')}
          disabled={disabled || !canUseMultimodal()}
        >
          <View style={[
            styles.modeIcon,
            {
              backgroundColor: selectedMode === 'multimodal' ? '#ffffff' : getThemeAwareColor('#4a0660', currentTheme)
            }
          ]}>
            <MaterialCommunityIcons
              name="eye-outline"
              size={20}
              color={selectedMode === 'multimodal' ? getThemeAwareColor('#4a0660', currentTheme) : '#ffffff'}
            />
          </View>
          <View style={styles.modeContent}>
            <Text style={[
              styles.modeTitle,
              { color: selectedMode === 'multimodal' ? '#ffffff' : themeColors.text }
            ]}>
              {getMultimodalTitle()}
            </Text>
            <Text style={[
              styles.modeDescription,
              { color: selectedMode === 'multimodal' ? 'rgba(255, 255, 255, 0.8)' : themeColors.secondaryText }
            ]}>
              {getModeDescription('multimodal')}
            </Text>
          </View>
          {!canUseMultimodal() && (
            <View style={styles.lockIcon}>
              <MaterialCommunityIcons
                name="lock-outline"
                size={16}
                color={themeColors.secondaryText}
              />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {selectedMode === 'ocr' && onToggleRag && ragEnabled && (
        <View
          style={[
            styles.ragRow,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <View style={styles.ragTextContainer}>
            <Text style={[styles.ragTitle, { color: themeColors.text }]}>Use RAG</Text>
            <Text style={[styles.ragDescription, { color: isDark ? '#bbbbbb' : '#666666' }]}>Store extracted text for this chat.</Text>
          </View>
          <Switch
            value={useRag}
            onValueChange={onToggleRag}
            disabled={disabled || ragToggleDisabled}
            trackColor={{ false: isDark ? '#444444' : '#dddddd', true: '#66088080' }}
            thumbColor={useRag ? '#660880' : isDark ? '#222222' : '#f2f2f2'}
          />
        </View>
      )}
      
      {selectedMode === 'ocr' && onToggleRag && !ragEnabled && (
        <View
          style={[
            styles.ragRow,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <MaterialCommunityIcons name="information-outline" size={20} color={isDark ? '#888888' : '#666666'} />
          <View style={[styles.ragTextContainer, { paddingLeft: 8 }]}>
            <Text style={[styles.ragTitle, { color: isDark ? '#888888' : '#666666' }]}>RAG not available</Text>
            <Text style={[styles.ragDescription, { color: isDark ? '#888888' : '#666666' }]}>Local RAG is not available for remote models.</Text>
          </View>
        </View>
      )}

      <Portal>
        <Dialog visible={mmProjSelectorVisible} onDismiss={handleProjectorSelectorClose}>
          <Dialog.Title style={{ color: isDark ? '#ffffff' : '#000000' }}>
            Select Multimodal Projector
          </Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 16, color: isDark ? '#ffffff' : '#000000' }}>
              Choose a projector (mmproj) model to enable multimodal capabilities:
            </Text>
            {isLoadingProjector ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={getThemeAwareColor('#4a0660', currentTheme)} />
                <Text style={[styles.loadingText, { color: isDark ? '#ffffff' : '#000000' }]}>
                  Loading projector model...
                </Text>
              </View>
            ) : storedModels.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons 
                  name="cube-outline" 
                  size={48} 
                  color={isDark ? '#666' : '#ccc'} 
                />
                <Text style={[
                  styles.emptyStateText,
                  { color: isDark ? '#ccc' : '#666' }
                ]}>
                  No projector models found in your stored models.{'\n'}
                </Text>
              </View>
            ) : (
              storedModels.map((model) => (
                <TouchableOpacity
                  key={model.path}
                  style={[
                    styles.projectorModelItem,
                    { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }
                  ]}
                  onPress={() => handleProjectorSelect(model)}
                  disabled={isLoadingProjector}
                >
                  <View style={[styles.projectorModelIcon, { backgroundColor: getThemeAwareColor('#4a0660', currentTheme) }]}>
                    <MaterialCommunityIcons
                      name="cube-outline"
                      size={16}
                      color="#ffffff"
                    />
                  </View>
                  <View style={styles.projectorModelInfo}>
                    <Text style={[
                      styles.projectorModelName,
                      { color: isDark ? '#fff' : '#000' }
                    ]}>
                      {model.name}
                    </Text>
                    <Text style={[
                      styles.projectorModelSize,
                      { color: isDark ? '#ccc' : '#666' }
                    ]}>
                      {(model.size / (1024 * 1024)).toFixed(1)} MB
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={isDark ? '#666' : '#ccc'}
                  />
                </TouchableOpacity>
              ))
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button 
              onPress={handleProjectorSkip}
              textColor={getThemeAwareColor('#4a0660', currentTheme)}
              disabled={isLoadingProjector}
            >
              Skip
            </Button>
            <Button 
              onPress={handleProjectorSelectorClose}
              textColor={getThemeAwareColor('#4a0660', currentTheme)}
              disabled={isLoadingProjector}
            >
              Cancel
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  modeOptions: {
    gap: 8,
  },
  modeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  modeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modeContent: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  modeDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  lockIcon: {
    marginLeft: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  projectorModelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginVertical: 2,
    borderRadius: 12,
  },
  projectorModelIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectorModelInfo: {
    flex: 1,
    marginLeft: 12,
  },
  projectorModelName: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 20,
  },
  projectorModelSize: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  ragRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    gap: 12,
  },
  ragTextContainer: {
    flex: 1,
  },
  ragTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  ragDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
}); 
