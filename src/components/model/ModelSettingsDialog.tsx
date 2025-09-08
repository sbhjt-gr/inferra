import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Dimensions,
  Animated,
  StatusBar,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { getThemeAwareColor } from '../../utils/ColorUtils';
import { llamaManager } from '../../utils/LlamaManager';
import { modelSettingsService, ModelSettings, ModelSettingsConfig } from '../../services/ModelSettingsService';
import ModelSettingsSection from '../settings/ModelSettingsSection';
import ChatSettingsSection from '../settings/ChatSettingsSection';
import SystemPromptDialog from '../SystemPromptDialog';
import MaxTokensDialog from '../MaxTokensDialog';
import StopWordsDialog from '../StopWordsDialog';

const { width: screenWidth } = Dimensions.get('window');

interface ModelSettingsDialogProps {
  visible: boolean;
  onClose: () => void;
  modelName: string;
  modelPath: string;
}

export default function ModelSettingsDialog({
  visible,
  onClose,
  modelName,
  modelPath,
}: ModelSettingsDialogProps) {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  
  const [modelSettingsConfig, setModelSettingsConfig] = useState<ModelSettingsConfig>({
    useGlobalSettings: true
  });
  const [globalSettings, setGlobalSettings] = useState<ModelSettings | null>(null);
  const [customSettings, setCustomSettings] = useState<ModelSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [systemPromptDialogVisible, setSystemPromptDialogVisible] = useState(false);
  const [maxTokensDialogVisible, setMaxTokensDialogVisible] = useState(false);
  const [stopWordsDialogVisible, setStopWordsDialogVisible] = useState(false);

  const slideAnim = React.useRef(new Animated.Value(screenWidth)).current;
  const backdropAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    console.log('[ModelSettingsDialog] Visibility changed:', visible, 'Model:', modelName);
    if (visible) {
      loadSettings();
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: screenWidth,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, modelPath]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const modelSettings = await modelSettingsService.getModelSettings(modelPath);
      const globalSettings = llamaManager.getSettings();
      
      setModelSettingsConfig(modelSettings);
      setGlobalSettings(globalSettings);
      
      if (modelSettings.customSettings) {
        setCustomSettings(modelSettings.customSettings);
      } else {
        setCustomSettings({ ...globalSettings });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleUseGlobal = async (useGlobal: boolean) => {
    try {
      const newModelSettings = {
        ...modelSettingsConfig,
        useGlobalSettings: useGlobal,
        customSettings: useGlobal ? undefined : customSettings || globalSettings
      };
      
      await modelSettingsService.setModelSettings(modelPath, newModelSettings);
      setModelSettingsConfig(newModelSettings);
    } catch (error) {
      console.error('Error toggling global settings:', error);
    }
  };

  const handleCustomSettingsChange = async (newSettings: Partial<ModelSettings>) => {
    if (!customSettings) return;
    
    const updatedSettings = { ...customSettings, ...newSettings };
    setCustomSettings(updatedSettings);
    
    try {
      await modelSettingsService.setCustomSettings(modelPath, updatedSettings);
      setModelSettingsConfig(prev => ({
        ...prev,
        customSettings: updatedSettings
      }));
    } catch (error) {
      console.error('Error saving custom settings:', error);
    }
  };

  const getDisplaySettings = (): ModelSettings => {
    if (modelSettingsConfig.useGlobalSettings || !customSettings) {
      return globalSettings || llamaManager.getSettings();
    }
    return customSettings;
  };

  const handleSaveAndClose = () => {
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: screenWidth,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const handleBackdropPress = () => {
    handleSaveAndClose();
  };

  const handleSystemPromptSave = (systemPrompt: string) => {
    handleCustomSettingsChange({ systemPrompt });
    setSystemPromptDialogVisible(false);
  };

  const handleMaxTokensSave = (maxTokens: number) => {
    handleCustomSettingsChange({ maxTokens });
    setMaxTokensDialogVisible(false);
  };

  const handleStopWordsSave = (stopWords: string[]) => {
    handleCustomSettingsChange({ stopWords });
    setStopWordsDialogVisible(false);
  };

  if (!visible) {
    console.log('[ModelSettingsDialog] Not visible, returning null');
    return null;
  }
  
  console.log('[ModelSettingsDialog] Rendering modal, visible:', visible);

  if (isLoading || !globalSettings) {
    return (
      <View style={styles.modalOverlay}>
        <Animated.View 
          style={[
            styles.backdrop,
            {
              opacity: backdropAnim,
            }
          ]}
        />
        <Animated.View 
          style={[
            styles.modalContainer,
            { backgroundColor: themeColors.background },
            {
              transform: [{ translateX: slideAnim }]
            }
          ]}
        >
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: themeColors.text }]}>
              Loading settings...
            </Text>
          </View>
        </Animated.View>
      </View>
    );
  }

  const displaySettings = getDisplaySettings();
  const canEditSettings = !modelSettingsConfig.useGlobalSettings;

  return (
    <>
      <StatusBar barStyle={currentTheme === 'dark' ? 'light-content' : 'dark-content'} />
      <View style={styles.modalOverlay}>
        <Animated.View 
          style={[
            styles.backdrop,
            {
              opacity: backdropAnim,
            }
          ]}
        >
          <TouchableOpacity 
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={handleBackdropPress}
          />
        </Animated.View>

        <Animated.View 
          style={[
            styles.modalContainer,
            { backgroundColor: themeColors.background },
            {
              transform: [{ translateX: slideAnim }]
            }
          ]}
        >
          <View style={[styles.header, { borderBottomColor: themeColors.borderColor }]}>
            <View style={styles.headerContent}>
              <TouchableOpacity onPress={handleSaveAndClose} style={styles.closeButton}>
                <MaterialCommunityIcons name="arrow-left" size={24} color={themeColors.text} />
              </TouchableOpacity>
              <View style={styles.headerText}>
                <Text style={[styles.headerTitle, { color: themeColors.text }]}>
                  Model Settings
                </Text>
                <Text style={[styles.headerSubtitle, { color: themeColors.secondaryText }]} numberOfLines={1}>
                  {modelName.replace('.gguf', '')}
                </Text>
              </View>
              <TouchableOpacity onPress={handleSaveAndClose} style={styles.saveButton}>
                <Text style={[styles.saveButtonText, { color: getThemeAwareColor('#4a0660', currentTheme) }]}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={[styles.headerIndicator, { backgroundColor: getThemeAwareColor('#4a0660', currentTheme) }]} />
          </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.globalToggleSection, { backgroundColor: themeColors.borderColor }]}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleTitle, { color: themeColors.text }]}>
                  Use Global Settings
                </Text>
                <Text style={[styles.toggleDescription, { color: themeColors.secondaryText }]}>
                  Use the same settings as configured in the main Settings screen
                </Text>
              </View>
              <Switch
                value={modelSettingsConfig.useGlobalSettings}
                onValueChange={handleToggleUseGlobal}
                trackColor={{
                  false: themeColors.secondaryText + '40',
                  true: getThemeAwareColor('#4a0660', currentTheme) + '80'
                }}
                thumbColor={
                  modelSettingsConfig.useGlobalSettings
                    ? getThemeAwareColor('#4a0660', currentTheme)
                    : themeColors.secondaryText
                }
              />
            </View>
          </View>

          {!modelSettingsConfig.useGlobalSettings && (
            <View style={styles.customSettingsSection}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                Custom Settings for This Model
              </Text>
              
              <ChatSettingsSection
                modelSettings={displaySettings}
                defaultSettings={globalSettings}
                onOpenSystemPromptDialog={() => setSystemPromptDialogVisible(true)}
                onResetSystemPrompt={() => handleCustomSettingsChange({ systemPrompt: globalSettings.systemPrompt })}
              />

              <ModelSettingsSection
                modelSettings={displaySettings}
                defaultSettings={globalSettings}
                error={null}
                onSettingsChange={handleCustomSettingsChange}
                onMaxTokensPress={() => setMaxTokensDialogVisible(true)}
                onStopWordsPress={() => setStopWordsDialogVisible(true)}
                onGrammarPress={() => {}}
                onSeedPress={() => {}}
                onNProbsPress={() => {}}
                onLogitBiasPress={() => {}}
              />
            </View>
          )}

          {modelSettingsConfig.useGlobalSettings && (
            <View style={[styles.globalPreviewSection, { backgroundColor: themeColors.borderColor }]}>
              <Text style={[styles.previewTitle, { color: themeColors.text }]}>
                Current Global Settings Preview
              </Text>
              <Text style={[styles.previewDescription, { color: themeColors.secondaryText }]}>
                These are the settings currently applied from your global configuration.
              </Text>
              
              <View style={styles.previewGrid}>
                <View style={styles.previewItem}>
                  <Text style={[styles.previewLabel, { color: themeColors.secondaryText }]}>Temperature</Text>
                  <Text style={[styles.previewValue, { color: themeColors.text }]}>{displaySettings.temperature}</Text>
                </View>
                <View style={styles.previewItem}>
                  <Text style={[styles.previewLabel, { color: themeColors.secondaryText }]}>Max Tokens</Text>
                  <Text style={[styles.previewValue, { color: themeColors.text }]}>{displaySettings.maxTokens}</Text>
                </View>
                <View style={styles.previewItem}>
                  <Text style={[styles.previewLabel, { color: themeColors.secondaryText }]}>Top-K</Text>
                  <Text style={[styles.previewValue, { color: themeColors.text }]}>{displaySettings.topK}</Text>
                </View>
                <View style={styles.previewItem}>
                  <Text style={[styles.previewLabel, { color: themeColors.secondaryText }]}>Top-P</Text>
                  <Text style={[styles.previewValue, { color: themeColors.text }]}>{displaySettings.topP}</Text>
                </View>
              </View>
            </View>
          )}
          </ScrollView>
        </Animated.View>
      </View>

      <SystemPromptDialog
        visible={systemPromptDialogVisible}
        onClose={() => setSystemPromptDialogVisible(false)}
        onSave={handleSystemPromptSave}
        value={displaySettings.systemPrompt}
        defaultValue={globalSettings.systemPrompt}
        description="Custom system prompt for this model"
      />

      <MaxTokensDialog
        visible={maxTokensDialogVisible}
        onClose={() => setMaxTokensDialogVisible(false)}
        onSave={handleMaxTokensSave}
        currentValue={displaySettings.maxTokens}
      />

      <StopWordsDialog
        visible={stopWordsDialogVisible}
        onClose={() => setStopWordsDialogVisible(false)}
        onSave={handleStopWordsSave}
        value={displaySettings.stopWords}
        defaultValue={globalSettings.stopWords}
        description="Custom stop words for this model"
      />
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: screenWidth,
    height: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: -5,
      height: 0,
    },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 20,
  },
  header: {
    borderBottomWidth: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 0,
    paddingHorizontal: 16,
    position: 'relative',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  closeButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerText: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 15,
    marginTop: 2,
    maxWidth: screenWidth * 0.6,
    opacity: 0.8,
  },
  saveButton: {
    padding: 8,
    marginRight: -8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerIndicator: {
    height: 3,
    width: 60,
    borderRadius: 1.5,
    alignSelf: 'center',
    marginBottom: -1.5,
  },
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  globalToggleSection: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 20,
  },
  toggleTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  toggleDescription: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.8,
  },
  customSettingsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    letterSpacing: 0.2,
  },
  globalPreviewSection: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  previewDescription: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
    opacity: 0.8,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  previewItem: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(74, 6, 96, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(74, 6, 96, 0.1)',
  },
  previewLabel: {
    fontSize: 13,
    marginBottom: 6,
    opacity: 0.7,
    fontWeight: '500',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  previewValue: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});