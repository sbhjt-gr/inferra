import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { getThemeAwareColor } from '../utils/ColorUtils';
import { llamaManager } from '../utils/LlamaManager';
import { modelSettingsService, ModelSettings, ModelSettingsConfig } from '../services/ModelSettingsService';
import ModelSettingsSection from '../components/settings/ModelSettingsSection';
import ChatSettingsSection from '../components/settings/ChatSettingsSection';
import SystemPromptDialog from '../components/SystemPromptDialog';
import MaxTokensDialog from '../components/MaxTokensDialog';
import StopWordsDialog from '../components/StopWordsDialog';
import ModelSettingDialog from '../components/ModelSettingDialog';
import AppHeader from '../components/AppHeader';
import { useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import { RAGService, type RAGStorageType } from '../services/rag/RAGService';

type ModelSettingsScreenRouteProp = RouteProp<RootStackParamList, 'ModelSettings'>;

type DialogConfig = {
  key?: keyof ModelSettings;
  label: string;
  ragActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  ragButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ragButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  ragButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
  },
  ragButtonTextSecondary: {
    fontWeight: '600',
    fontSize: 14,
  },
  ragLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  ragLoadingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  value: number;
  defaultValue?: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
  description: string;
  onSave?: (value: number) => void | Promise<void>;
};

export default function ModelSettingsScreen() {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const route = useRoute<ModelSettingsScreenRouteProp>();
  
  const { modelName, modelPath } = route.params;
  
  const [modelSettingsConfig, setModelSettingsConfig] = useState<ModelSettingsConfig>({
    useGlobalSettings: true,
  });
  const [globalSettings, setGlobalSettings] = useState<ModelSettings | undefined>(undefined);
  const [customSettings, setCustomSettings] = useState<ModelSettings | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [ragStorageType, setRagStorageType] = useState<RAGStorageType>('memory');
  const [ragBusy, setRagBusy] = useState(false);
  const [systemPromptDialogVisible, setSystemPromptDialogVisible] = useState(false);
  const [maxTokensDialogVisible, setMaxTokensDialogVisible] = useState(false);
  const [stopWordsDialogVisible, setStopWordsDialogVisible] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<DialogConfig | null>(null);

  useEffect(() => {
    loadSettings();
    loadRAGPreferences();
  }, [modelPath]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const modelSettings = await modelSettingsService.getModelSettings(modelPath);
      const settings = llamaManager.getSettings();

      setModelSettingsConfig(modelSettings);
      setGlobalSettings(settings);
      const computedCustom = modelSettings.customSettings
        ? modelSettings.customSettings
        : { ...settings };
      setCustomSettings(computedCustom);
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  const loadRAGPreferences = async () => {
    try {
      const [enabled, storage] = await Promise.all([
        RAGService.isEnabled(),
        RAGService.getStorageType(),
      ]);
      setRagEnabled(enabled);
      setRagStorageType(storage);
      if (enabled) {
        try {
          await RAGService.initialize();
        } catch (error) {
          setRagEnabled(false);
          await RAGService.setEnabled(false);
        }
      }
    } catch (error) {
    }
  };

  const handleToggleUseGlobal = async (useGlobal: boolean) => {
    try {
      const nextCustom = !useGlobal ? customSettings ?? globalSettings : undefined;
      const newModelSettings: ModelSettingsConfig = {
        ...modelSettingsConfig,
        useGlobalSettings: useGlobal,
        customSettings: nextCustom,
      };

      await modelSettingsService.setModelSettings(modelPath, newModelSettings);
      setModelSettingsConfig(newModelSettings);
    } catch (error) {
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
    }
  };

  const getDisplaySettings = (): ModelSettings => {
    if (modelSettingsConfig.useGlobalSettings || !customSettings) {
      return globalSettings || llamaManager.getSettings();
    }
    return customSettings;
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

  const handleDialogOpen = (config: DialogConfig) => {
    let defaultValue = config.defaultValue;
    if (defaultValue === undefined) {
      if (config.key && globalSettings) {
        defaultValue = globalSettings[config.key] as unknown as number;
      } else {
        defaultValue = config.value;
      }
    }

    let source: ModelSettings | undefined;
    if (modelSettingsConfig.useGlobalSettings) {
      source = globalSettings ?? llamaManager.getSettings();
    } else {
      source = customSettings ?? globalSettings ?? llamaManager.getSettings();
    }

    let value = config.value;
    if (config.key && source) {
      value = source[config.key] as unknown as number;
    }

    setDialogConfig({ ...config, defaultValue, value });
  };

  const handleDialogSave = (value: number) => {
    if (dialogConfig) {
      if (dialogConfig.key) {
        handleCustomSettingsChange({ [dialogConfig.key]: value } as Partial<ModelSettings>);
      }
      if (dialogConfig.onSave) {
        const result = dialogConfig.onSave(value);
        if (result && typeof (result as Promise<void>).then === 'function') {
          (result as Promise<void>).catch(() => {});
        }
      }
    }
    setDialogConfig(null);
  };

  const handleToggleRAG = async (value: boolean) => {
    if (value && !llamaManager.isInitialized()) {
      Alert.alert('Model not ready', 'Load this model before enabling retrieval.');
      return;
    }

    setRagBusy(true);
    try {
      await RAGService.setEnabled(value);
      if (value) {
        try {
          await RAGService.initialize();
        } catch (error) {
          await RAGService.setEnabled(false);
          setRagEnabled(false);
          Alert.alert('RAG error', 'Retrieval could not be enabled.');
          setRagBusy(false);
          return;
        }
      }
      setRagEnabled(value);
    } catch (error) {
      Alert.alert('RAG error', value ? 'Retrieval could not be enabled.' : 'Retrieval could not be disabled.');
    } finally {
      setRagBusy(false);
    }
  };

  const handleStorageToggle = async () => {
    const nextType: RAGStorageType = ragStorageType === 'memory' ? 'persistent' : 'memory';
    setRagBusy(true);
    try {
      await RAGService.setStorageType(nextType);
      setRagStorageType(nextType);
    } catch (error) {
      Alert.alert('RAG error', 'Storage could not be updated.');
    } finally {
      setRagBusy(false);
    }
  };

  const handleClearRAG = () => {
    if (!ragEnabled) {
      return;
    }

    Alert.alert(
      'Clear RAG data',
      'Remove all stored documents?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setRagBusy(true);
            try {
              await RAGService.clear();
            } catch (error) {
              Alert.alert('RAG error', 'Unable to clear data.');
            } finally {
              setRagBusy(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  if (isLoading || !globalSettings) {
    return (
      <View style={{ flex: 1, backgroundColor: themeColors.background }}>
        <AppHeader 
          title="Model Settings"
          showBackButton
          showLogo={false}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={[styles.loadingText, { color: themeColors.text }]}>
            Loading settings...
          </Text>
        </View>
      </View>
    );
  }

  const displaySettings = getDisplaySettings();

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <AppHeader 
        title="Model Settings"
        showBackButton
        showLogo={false}
        rightButtons={[]}
      />
      
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.modelInfo}>
          <Text style={[styles.modelName, { color: themeColors.text }]}>
            {modelName.replace('.gguf', '')}
          </Text>
        </View>

        <View style={[styles.settingCard, { backgroundColor: themeColors.borderColor }]}>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : getThemeAwareColor('#4a0660', currentTheme) + '20' }]}>
                <MaterialCommunityIcons name="cog-outline" size={22} color={currentTheme === 'dark' ? '#FFFFFF' : getThemeAwareColor('#4a0660', currentTheme)} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Use Global Settings
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  Use the same settings as configured in the main Settings screen
                </Text>
              </View>
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

        <View style={[styles.settingCard, { backgroundColor: themeColors.borderColor }]}> 
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : getThemeAwareColor('#4a0660', currentTheme) + '20' }]}> 
                <MaterialCommunityIcons name="database-search" size={22} color={currentTheme === 'dark' ? '#FFFFFF' : getThemeAwareColor('#4a0660', currentTheme)} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>Retrieval Augmented Generation</Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>Use stored documents to enrich answers</Text>
              </View>
            </View>
            <Switch
              value={ragEnabled}
              onValueChange={handleToggleRAG}
              disabled={ragBusy}
              trackColor={{
                false: themeColors.secondaryText + '40',
                true: getThemeAwareColor('#4a0660', currentTheme) + '80',
              }}
              thumbColor={ragEnabled ? getThemeAwareColor('#4a0660', currentTheme) : themeColors.secondaryText}
            />
          </View>

          {ragEnabled && (
            <View style={styles.ragActions}>
              <TouchableOpacity
                style={[styles.ragButton, { backgroundColor: themeColors.primary }]}
                onPress={handleStorageToggle}
                disabled={ragBusy}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="database" size={18} color="#FFFFFF" />
                <Text style={styles.ragButtonText}>
                  {ragStorageType === 'memory' ? 'Memory storage' : 'Persistent storage'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ragButtonSecondary, { borderColor: themeColors.primary }]}
                onPress={handleClearRAG}
                disabled={ragBusy}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={themeColors.primary} />
                <Text style={[styles.ragButtonTextSecondary, { color: themeColors.primary }]}>Clear data</Text>
              </TouchableOpacity>
            </View>
          )}

          {ragBusy && (
            <View style={styles.ragLoadingRow}>
              <ActivityIndicator size="small" color={themeColors.primary} />
              <Text style={[styles.ragLoadingText, { color: themeColors.secondaryText }]}>Updating retrieval...</Text>
            </View>
          )}
        </View>

        {!modelSettingsConfig.useGlobalSettings && (
          <View style={styles.customSettingsSection}>
            <View style={styles.settingsContainer}>
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
                onDrySequenceBreakersPress={() => {}}
                onDialogOpen={handleDialogOpen}
                defaultExpanded={false}
              />
            </View>
          </View>
        )}

        {modelSettingsConfig.useGlobalSettings && (
          <View style={[styles.settingCard, { backgroundColor: themeColors.borderColor }]}>
            <View style={styles.previewContent}>
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
          </View>
        )}
      </ScrollView>

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

      {dialogConfig && (
        <ModelSettingDialog
          visible
          onClose={() => setDialogConfig(null)}
          onSave={handleDialogSave}
          label={dialogConfig.label}
          value={dialogConfig.value}
          defaultValue={dialogConfig.defaultValue ?? dialogConfig.value}
          minimumValue={dialogConfig.minimumValue}
          maximumValue={dialogConfig.maximumValue}
          step={dialogConfig.step}
          description={dialogConfig.description}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
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
    marginTop: 16,
  },
  modelInfo: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modelName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  settingCard: {
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
  },
  customSettingsSection: {
    marginBottom: 20,
  },
  settingsContainer: {
    marginHorizontal: -16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    letterSpacing: 0.2,
  },
  previewContent: {
    padding: 16,
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
  ragActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  ragButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ragButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  ragButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
  },
  ragButtonTextSecondary: {
    fontWeight: '600',
    fontSize: 14,
  },
  ragLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  ragLoadingText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
