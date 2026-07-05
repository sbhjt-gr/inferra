import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import LiteRtIcon from '../components/icons/LiteRtIcon';
import { useTheme } from '../context/ThemeContext';
import { getEngineSettingsMeta, getEngineSettingsRoute } from '../config/engineSettings';
import { theme } from '../constants/theme';
import { GradientBg } from '../services/adapters/GradientBgAdapter';
import { AppSwitch } from '../services/adapters/SwitchAdapter';
import { getThemeAwareColor } from '../utils/ColorUtils';
import { llamaManager } from '../utils/LlamaManager';
import { modelSettingsService, ModelSettings, ModelSettingsConfig } from '../services/ModelSettingsService';
import { engineService } from '../services/runtime-service';
import {
  formatLiteRTBackend,
  getLiteRTBackendWarning,
  getLiteRTRecommendedBackend,
  isLiteRTBackendSelectable,
  litertBackendOptions,
  type LiteRTBackend,
} from '../services/LiteRTBackendService';
import ModelSettingsSection from '../components/settings/ModelSettingsSection';
import ChatSettingsSection from '../components/settings/ChatSettingsSection';
import SystemPromptDialog from '../components/SystemPromptDialog';
import MaxTokensDialog from '../components/MaxTokensDialog';
import StopWordsDialog from '../components/StopWordsDialog';
import ModelSettingDialog from '../components/ModelSettingDialog';
import AppHeader from '../components/AppHeader';
import { useRouter, useLocalSearchParams } from 'expo-router';

type DialogConfig = {
  key?: keyof ModelSettings;
  label: string;
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
  const router = useRouter();
  const { modelName, modelPath } = useLocalSearchParams<{ modelName: string; modelPath: string }>();
  
  const [modelSettingsConfig, setModelSettingsConfig] = useState<ModelSettingsConfig>({
    useGlobalSettings: true,
  });
  const [globalSettings, setGlobalSettings] = useState<ModelSettings | undefined>(undefined);
  const [customSettings, setCustomSettings] = useState<ModelSettings | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [systemPromptDialogVisible, setSystemPromptDialogVisible] = useState(false);
  const [maxTokensDialogVisible, setMaxTokensDialogVisible] = useState(false);
  const [stopWordsDialogVisible, setStopWordsDialogVisible] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<DialogConfig | null>(null);

  useEffect(() => {
    loadSettings();
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

  const handleLiteRTBackendChange = async (backend: LiteRTBackend) => {
    try {
      const nextConfig: ModelSettingsConfig = {
        ...modelSettingsConfig,
        litertBackend: backend,
      };
      await modelSettingsService.setModelSettings(modelPath, nextConfig);
      setModelSettingsConfig(nextConfig);
    } catch {
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

  if (isLoading || !globalSettings) {
    return (
      <View style={{ flex: 1, backgroundColor: themeColors.background }}>
        <GradientBg />
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
  const benchmarkEngine = engineService.getEngineForModel(modelPath);
  const settingsMeta = getEngineSettingsMeta(benchmarkEngine);
  const displayModelName = modelName.replace(/\.(gguf|litertlm|task)$/i, '');
  const litertBackend = modelSettingsConfig.litertBackend ?? getLiteRTRecommendedBackend();
  const recommendedLiteRTBackend = getLiteRTRecommendedBackend();
  const litertBackendWarning = getLiteRTBackendWarning(litertBackend);

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <GradientBg />
      <AppHeader 
        title="Model Settings"
        showBackButton
        showLogo={false}
        rightButtons={[]}
      />
      
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.modelInfo}>
          <Text style={[styles.modelName, { color: themeColors.text }]}>
            {displayModelName}
          </Text>
        </View>

        {benchmarkEngine === 'litert' && (
          <View style={[styles.settingCard, { backgroundColor: themeColors.borderColor }]}> 
            <View style={styles.backendHeader}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0,0,0,0.06)' }]}>
                  <LiteRtIcon size={22} />
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingText, { color: themeColors.text }]}> 
                    LiteRT Backend
                  </Text>
                  <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}> 
                    Choose the runtime target for this LiteRT model.
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.backendRow}>
              {litertBackendOptions.map(option => {
                const selected = option === litertBackend;
                const selectable = isLiteRTBackendSelectable(option);
                const recommended = option === recommendedLiteRTBackend;

                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.backendChip,
                      {
                        backgroundColor: selected ? themeColors.primary : themeColors.background,
                        borderColor: selected ? themeColors.primary : themeColors.secondaryText + '20',
                        opacity: selectable ? 1 : 0.45,
                      },
                    ]}
                    disabled={!selectable}
                    onPress={() => handleLiteRTBackendChange(option)}
                  >
                    <Text style={[styles.backendChipText, { color: selected ? '#FFFFFF' : themeColors.text }]}>
                      {formatLiteRTBackend(option)}
                    </Text>
                    {recommended ? (
                      <Text style={[styles.backendChipMeta, { color: selected ? '#FFFFFF' : themeColors.secondaryText }]}>Recommended</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.backendHint, { color: themeColors.secondaryText }]}>Recommended backend: {formatLiteRTBackend(recommendedLiteRTBackend)}</Text>
            {litertBackendWarning ? (
              <Text style={styles.backendWarning}>{litertBackendWarning}</Text>
            ) : null}
          </View>
        )}

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
            <AppSwitch
              value={modelSettingsConfig.useGlobalSettings}
              onValueChange={handleToggleUseGlobal}
            />
          </View>
        </View>

        {!modelSettingsConfig.useGlobalSettings && (
          <View style={styles.customSettingsSection}>
            <View style={styles.settingsContainer}>
              <ChatSettingsSection
                modelSettings={displaySettings}
                defaultSettings={globalSettings}
                onOpenSystemPromptDialog={() => setSystemPromptDialogVisible(true)}
              />

              <ModelSettingsSection
                modelSettings={displaySettings}
                defaultSettings={globalSettings}
                error={null}
                onSettingsChange={handleCustomSettingsChange}
                onDialogOpen={handleDialogOpen}
                parameterEntries={[
                  {
                    key: benchmarkEngine,
                    label: settingsMeta.entryLabel,
                    description: settingsMeta.entryDescription,
                    badgeLabel: settingsMeta.badgeLabel,
                    iconName: settingsMeta.iconName,
                    iconKey: settingsMeta.iconKey,
                    accentColor: settingsMeta.accentColor,
                    onPress: () => router.push({ pathname: getEngineSettingsRoute(benchmarkEngine), params: { modelName, modelPath } }),
                  },
                ]}
              />
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
  backendHeader: {
    padding: 16,
    paddingBottom: 8,
  },
  backendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
  },
  backendChip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 92,
    alignItems: 'center',
  },
  backendChipText: {
    fontSize: 14,
    fontWeight: '700',
  },
  backendChipMeta: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
  },
  backendHint: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  backendWarning: {
    color: '#C62828',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
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
});

