import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppSwitch } from '../../services/adapters/SwitchAdapter';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import SettingSlider from '../SettingSlider';
import type { GpuConfig } from './ModelSettingsCore';

type ModelSettings = {
  maxTokens: number;
  temperature: number;
  topK: number;
  topP: number;
  minP: number;
  xtcProbability: number;
  xtcThreshold: number;
  typicalP: number;
  includeThinkingTokens: boolean;
};

type ModelSettingsSamplingProps = {
  modelSettings: ModelSettings;
  defaultSettings: Partial<ModelSettings>;
  error: string | null;
  onSettingsChange: (settings: Partial<ModelSettings>) => void;
  onMaxTokensPress: () => void;
  onDialogOpen: (config: any) => void;
  showMlxWarning?: boolean;
  noExtraBuffers?: boolean;
  onToggleNoExtraBuffers?: (enabled: boolean) => void;
  gpuConfig?: GpuConfig;
  onToggleGpu?: (enabled: boolean) => void;
  visibility?: {
    showMaxTokens?: boolean;
    showTemperature?: boolean;
    showTopP?: boolean;
    showTopK?: boolean;
    showMinP?: boolean;
    showXtc?: boolean;
    showTypicalP?: boolean;
    showCountThinkingTokens?: boolean;
    showNoExtraBuffers?: boolean;
    showGpu?: boolean;
  };
};

const ModelSettingsSampling = ({
  modelSettings,
  defaultSettings,
  error,
  onSettingsChange,
  onMaxTokensPress,
  onDialogOpen,
  showMlxWarning,
  noExtraBuffers,
  onToggleNoExtraBuffers,
  gpuConfig,
  onToggleGpu,
  visibility,
}: ModelSettingsSamplingProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;

  const showMaxTokens = visibility?.showMaxTokens ?? true;
  const showTemperature = visibility?.showTemperature ?? true;
  const showTopP = visibility?.showTopP ?? true;
  const showTopK = visibility?.showTopK ?? true;
  const showMinP = visibility?.showMinP ?? true;
  const showXtc = visibility?.showXtc ?? true;
  const showTypicalP = visibility?.showTypicalP ?? true;
  const showCountThinkingTokens = visibility?.showCountThinkingTokens ?? true;
  const showNoExtraBuffers = (visibility?.showNoExtraBuffers ?? true) && Boolean(onToggleNoExtraBuffers);
  const showGpu = (visibility?.showGpu ?? true) && Boolean(gpuConfig && onToggleGpu);
  const showEssentialSection =
    showMaxTokens ||
    showNoExtraBuffers ||
    showGpu ||
    showCountThinkingTokens ||
    showTemperature ||
    showTopP ||
    showTopK;
  const showAdvancedSamplingSection =
    showMinP ||
    showXtc ||
    showTypicalP;

  return (
    <>
      {showEssentialSection ? (
        <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}> 
          <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>ESSENTIAL SETTINGS</Text>
        </View>
      ) : null}

      {showMaxTokens ? (
        <TouchableOpacity 
          style={[styles.settingItem, styles.settingItemBorder]}
          onPress={onMaxTokensPress}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}> 
              <MaterialCommunityIcons name="text" size={22} color={iconColor} />
            </View>
            <View style={styles.settingTextContainer}>
              <View style={styles.labelRow}>
                <Text style={[styles.settingText, { color: themeColors.text }]}> 
                  Max Response Tokens
                </Text>
                <Text style={[styles.valueText, { color: themeColors.text }]}> 
                  {modelSettings.maxTokens}
                </Text>
              </View>
              <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}> 
                Maximum number of tokens in model responses.
              </Text>
              {modelSettings.maxTokens !== defaultSettings.maxTokens && (
                <TouchableOpacity
                  onPress={() => onSettingsChange({ maxTokens: defaultSettings.maxTokens })}
                  style={[styles.resetButton, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}
                >
                  <MaterialCommunityIcons name="refresh" size={14} color={iconColor} />
                  <Text style={[styles.resetText, { color: iconColor }]}>Reset to Default</Text>
                </TouchableOpacity>
              )}
              {error && (
                <Text style={[styles.errorText, { color: '#FF3B30' }]}> 
                  {error}
                </Text>
              )}
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.secondaryText} />
        </TouchableOpacity>
      ) : null}

      {showNoExtraBuffers ? (
        <View style={[styles.settingItem, styles.settingItemBorder]}>
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
              <MaterialCommunityIcons name="memory" size={22} color={iconColor} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingText, { color: themeColors.text }]}>
                Disable Extra Buffers
              </Text>
              <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                Reduces memory usage by skipping weight repacking buffers. Prompt processing may be slower.
              </Text>
              {showMlxWarning && (
                <Text style={styles.unsupportedText}>Unsupported on MLX</Text>
              )}
            </View>
          </View>
          <AppSwitch
            value={Boolean(noExtraBuffers)}
            onValueChange={onToggleNoExtraBuffers}
          />
        </View>
      ) : null}

      {showGpu ? (
        <View style={[styles.settingItem, styles.settingItemBorder]}>
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
              <MaterialCommunityIcons name="chip" size={22} color={iconColor} />
            </View>
            <View style={styles.settingTextContainer}>
              <View style={styles.labelRow}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  {gpuConfig!.label}
                </Text>
                {gpuConfig!.experimental && (
                  <View style={[styles.gpuBadge, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                    <Text style={[styles.gpuBadgeText, { color: iconColor }]}>EXPERIMENTAL</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                {gpuConfig!.description}
              </Text>
              {!gpuConfig!.supported && gpuConfig!.reason && (
                <Text style={[styles.gpuSupportText, { color: themeColors.secondaryText }]}>
                  {gpuConfig!.reason === 'ios_version' && 'Requires iOS 18 or newer.'}
                  {gpuConfig!.reason === 'no_adreno' && 'Requires an Adreno GPU.'}
                  {gpuConfig!.reason === 'missing_cpu_features' && 'Missing required CPU features.'}
                </Text>
              )}
            </View>
          </View>
          <AppSwitch
            value={gpuConfig!.enabled}
            onValueChange={onToggleGpu!}
            disabled={!gpuConfig!.supported}
          />
        </View>
      ) : null}

      {showCountThinkingTokens ? (
        <View style={[styles.settingItem, styles.settingItemBorder]}>
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}> 
              <MaterialCommunityIcons name="brain" size={22} color={iconColor} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingText, { color: themeColors.text }]}> 
                Count Thinking Tokens
              </Text>
              <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}> 
                Include reasoning tokens in the token count and speed stats.
              </Text>
            </View>
          </View>
          <AppSwitch
            value={modelSettings.includeThinkingTokens ?? false}
            onValueChange={(value) => onSettingsChange({ includeThinkingTokens: value })}
          />
        </View>
      ) : null}

      {showTemperature ? (
        <SettingSlider
          label="Temperature"
          value={modelSettings.temperature ?? 0.7}
          defaultValue={defaultSettings.temperature ?? 0.7}
          onValueChange={(value) => onSettingsChange({ temperature: value })}
          minimumValue={0}
          maximumValue={2}
          step={0.01}
          description="Controls randomness in responses. Higher values make the output more creative but less focused."
          onPressChange={() => onDialogOpen({
            key: 'temperature',
            label: 'Temperature',
            value: modelSettings.temperature ?? 0.7,
            minimumValue: 0,
            maximumValue: 2,
            step: 0.01,
            description: "Controls randomness in responses. Higher values make the output more creative but less focused."
          })}
        />
      ) : null}

      {showTopP ? (
        <SettingSlider
          label="Top P"
          value={modelSettings.topP ?? 0.95}
          defaultValue={defaultSettings.topP ?? 0.95}
          onValueChange={(value) => onSettingsChange({ topP: value })}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          description="Controls diversity of responses. Higher values = more diverse but potentially less focused."
          onPressChange={() => onDialogOpen({
            key: 'topP',
            label: 'Top P',
            value: modelSettings.topP ?? 0.95,
            minimumValue: 0,
            maximumValue: 1,
            step: 0.01,
            description: "Controls diversity of responses. Higher values = more diverse but potentially less focused."
          })}
        />
      ) : null}

      {showTopK ? (
        <SettingSlider
          label="Top K"
          value={modelSettings.topK ?? 40}
          defaultValue={defaultSettings.topK ?? 40}
          onValueChange={(value) => onSettingsChange({ topK: value })}
          minimumValue={1}
          maximumValue={100}
          step={1}
          description="Limits the cumulative probability of tokens considered for each step of text generation."
          onPressChange={() => onDialogOpen({
            key: 'topK',
            label: 'Top K',
            value: modelSettings.topK ?? 40,
            minimumValue: 1,
            maximumValue: 100,
            step: 1,
            description: "Limits the cumulative probability of tokens considered for each step of text generation."
          })}
        />
      ) : null}

      {showAdvancedSamplingSection ? (
        <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}> 
          <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>ADVANCED SAMPLING</Text>
        </View>
      ) : null}

      {showMinP ? (
        <SettingSlider
          label="Min P"
          value={modelSettings.minP ?? 0.05}
          defaultValue={defaultSettings.minP ?? 0.05}
          onValueChange={(value) => onSettingsChange({ minP: value })}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          description="Minimum probability threshold. Higher values = more focused on likely tokens."
          onPressChange={() => onDialogOpen({
            key: 'minP',
            label: 'Min P',
            value: modelSettings.minP ?? 0.05,
            minimumValue: 0,
            maximumValue: 1,
            step: 0.01,
            description: "Minimum probability threshold. Higher values = more focused on likely tokens."
          })}
        />
      ) : null}

      {showXtc ? (
        <SettingSlider
          label="XTC Probability"
          value={modelSettings.xtcProbability ?? 0}
          defaultValue={defaultSettings.xtcProbability ?? 0}
          onValueChange={(value) => onSettingsChange({ xtcProbability: value })}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          description="Chance for token removal via XTC sampler. 0 disables XTC sampling."
          warningText={showMlxWarning ? 'Unsupported on MLX' : undefined}
          onPressChange={() => onDialogOpen({
            key: 'xtcProbability',
            label: 'XTC Probability',
            value: modelSettings.xtcProbability ?? 0,
            minimumValue: 0,
            maximumValue: 1,
            step: 0.01,
            description: "Chance for token removal via XTC sampler. 0 disables XTC sampling."
          })}
        />
      ) : null}

      {showXtc ? (
        <SettingSlider
          label="XTC Threshold"
          value={modelSettings.xtcThreshold ?? 0.1}
          defaultValue={defaultSettings.xtcThreshold ?? 0.1}
          onValueChange={(value) => onSettingsChange({ xtcThreshold: value })}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          description="Minimum probability threshold for XTC removal. Values > 0.5 disable XTC."
          warningText={showMlxWarning ? 'Unsupported on MLX' : undefined}
          onPressChange={() => onDialogOpen({
            key: 'xtcThreshold',
            label: 'XTC Threshold',
            value: modelSettings.xtcThreshold ?? 0.1,
            minimumValue: 0,
            maximumValue: 1,
            step: 0.01,
            description: "Minimum probability threshold for XTC removal. Values > 0.5 disable XTC."
          })}
        />
      ) : null}

      {showTypicalP ? (
        <SettingSlider
          label="Typical P"
          value={modelSettings.typicalP ?? 1}
          defaultValue={defaultSettings.typicalP ?? 1}
          onValueChange={(value) => onSettingsChange({ typicalP: value })}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          description="Enable locally typical sampling. 1.0 disables, lower values filter unlikely tokens."
          onPressChange={() => onDialogOpen({
            key: 'typicalP',
            label: 'Typical P',
            value: modelSettings.typicalP ?? 1,
            minimumValue: 0,
            maximumValue: 1,
            step: 0.01,
            description: "Enable locally typical sampling. 1.0 disables, lower values filter unlikely tokens."
          })}
        />
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.1)',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingItemBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.1)',
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
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  valueText: {
    fontSize: 16,
    fontWeight: '500',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    padding: 4,
    borderRadius: 4,
  },
  resetText: {
    fontSize: 12,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
    color: '#FF3B30',
  },
  unsupportedText: {
    fontSize: 11,
    color: '#FF9500',
    fontWeight: '500',
    marginTop: 4,
  },
  disabledItem: {
    opacity: 0.5,
  },
  gpuBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  gpuBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  gpuSupportText: {
    fontSize: 12,
    marginTop: 6,
  },
});

export default ModelSettingsSampling;
