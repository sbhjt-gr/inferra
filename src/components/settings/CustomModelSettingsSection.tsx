import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Switch } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import SettingSlider from '../SettingSlider';
import { getThemeAwareColor } from '../../utils/ColorUtils';

type ModelSettings = {
  maxTokens: number;
  temperature: number;
  topK: number;
  topP: number;
  minP: number;
  stopWords: string[];
  jinja: boolean;
  grammar: string;
  nProbs: number;
  penaltyLastN: number;
  penaltyRepeat: number;
  penaltyFreq: number;
  penaltyPresent: number;
  mirostat: number;
  mirostatTau: number;
  mirostatEta: number;
  dryMultiplier: number;
  dryBase: number;
  dryAllowedLength: number;
  dryPenaltyLastN: number;
  drySequenceBreakers: string[];
  ignoreEos: boolean;
  logitBias: Array<Array<number>>;
  seed: number;
  xtcProbability: number;
  xtcThreshold: number;
  typicalP: number;
  enableThinking: boolean;
};

type CustomModelSettingsSectionProps = {
  modelSettings: ModelSettings;
  defaultSettings: ModelSettings;
  error: string | null;
  onSettingsChange: (settings: Partial<ModelSettings>) => void;
  onMaxTokensPress: () => void;
  onStopWordsPress: () => void;
  onGrammarPress: () => void;
  onSeedPress: () => void;
  onNProbsPress: () => void;
  onLogitBiasPress: () => void;
};

const CustomModelSettingsSection = ({
  modelSettings,
  defaultSettings,
  error,
  onSettingsChange,
  onMaxTokensPress,
  onStopWordsPress,
  onGrammarPress,
  onSeedPress,
  onNProbsPress,
  onLogitBiasPress,
}: CustomModelSettingsSectionProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  const isDifferent = (current: any, defaultValue: any): boolean => {
    if (typeof current === 'number' && typeof defaultValue === 'number') {
      return Math.abs(current - defaultValue) > 0.001;
    }
    return current !== defaultValue;
  };

  const SettingItem = ({ 
    icon, 
    title, 
    description, 
    value, 
    onPress, 
    showReset = false, 
    onReset 
  }: {
    icon: string;
    title: string;
    description: string;
    value: string;
    onPress: () => void;
    showReset?: boolean;
    onReset?: () => void;
  }) => (
    <View style={[styles.settingCard, { backgroundColor: themeColors.borderColor }]}>
      <TouchableOpacity style={styles.settingContent} onPress={onPress}>
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: getThemeAwareColor('#4a0660', currentTheme) + '20' }]}>
            <MaterialCommunityIcons name={icon as any} size={20} color={getThemeAwareColor('#4a0660', currentTheme)} />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingTitle, { color: themeColors.text }]}>{title}</Text>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>{description}</Text>
            {showReset && onReset && (
              <TouchableOpacity
                onPress={onReset}
                style={[styles.resetButton, { backgroundColor: getThemeAwareColor('#4a0660', currentTheme) + '20' }]}
              >
                <MaterialCommunityIcons name="refresh" size={12} color={getThemeAwareColor('#4a0660', currentTheme)} />
                <Text style={[styles.resetText, { color: getThemeAwareColor('#4a0660', currentTheme) }]}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.settingRight}>
          <Text style={[styles.settingValue, { color: themeColors.text }]}>{value}</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={themeColors.secondaryText} />
        </View>
      </TouchableOpacity>
    </View>
  );

  const SwitchItem = ({ 
    icon, 
    title, 
    description, 
    value, 
    onValueChange, 
    showReset = false, 
    onReset 
  }: {
    icon: string;
    title: string;
    description: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
    showReset?: boolean;
    onReset?: () => void;
  }) => (
    <View style={[styles.settingCard, { backgroundColor: themeColors.borderColor }]}>
      <View style={styles.settingContent}>
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: getThemeAwareColor('#4a0660', currentTheme) + '20' }]}>
            <MaterialCommunityIcons name={icon as any} size={20} color={getThemeAwareColor('#4a0660', currentTheme)} />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingTitle, { color: themeColors.text }]}>{title}</Text>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>{description}</Text>
            {showReset && onReset && (
              <TouchableOpacity
                onPress={onReset}
                style={[styles.resetButton, { backgroundColor: getThemeAwareColor('#4a0660', currentTheme) + '20' }]}
              >
                <MaterialCommunityIcons name="refresh" size={12} color={getThemeAwareColor('#4a0660', currentTheme)} />
                <Text style={[styles.resetText, { color: getThemeAwareColor('#4a0660', currentTheme) }]}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{
            false: themeColors.secondaryText + '40',
            true: getThemeAwareColor('#4a0660', currentTheme) + '80'
          }}
          thumbColor={value ? getThemeAwareColor('#4a0660', currentTheme) : themeColors.secondaryText}
        />
      </View>
    </View>
  );

  const SliderItem = ({ 
    icon, 
    title, 
    description, 
    value, 
    defaultValue, 
    onValueChange, 
    minimumValue, 
    maximumValue, 
    step 
  }: {
    icon: string;
    title: string;
    description: string;
    value: number;
    defaultValue: number;
    onValueChange: (value: number) => void;
    minimumValue: number;
    maximumValue: number;
    step: number;
  }) => (
    <View style={[styles.settingCard, { backgroundColor: themeColors.borderColor }]}>
      <View style={styles.sliderContent}>
        <View style={styles.sliderHeader}>
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: getThemeAwareColor('#4a0660', currentTheme) + '20' }]}>
              <MaterialCommunityIcons name={icon as any} size={20} color={getThemeAwareColor('#4a0660', currentTheme)} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>{title}</Text>
              <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>{description}</Text>
              {isDifferent(value, defaultValue) && (
                <TouchableOpacity
                  onPress={() => onValueChange(defaultValue)}
                  style={[styles.resetButton, { backgroundColor: getThemeAwareColor('#4a0660', currentTheme) + '20' }]}
                >
                  <MaterialCommunityIcons name="refresh" size={12} color={getThemeAwareColor('#4a0660', currentTheme)} />
                  <Text style={[styles.resetText, { color: getThemeAwareColor('#4a0660', currentTheme) }]}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <Text style={[styles.settingValue, { color: themeColors.text }]}>{value}</Text>
        </View>
        <SettingSlider
          label=""
          value={value}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          step={step}
          description=""
        />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionHeader, { color: themeColors.text }]}>Essential Settings</Text>
      
      <SettingItem
        icon="text"
        title="Max Response Tokens"
        description="Maximum number of tokens in model responses"
        value={modelSettings.maxTokens.toString()}
        onPress={onMaxTokensPress}
        showReset={isDifferent(modelSettings.maxTokens, defaultSettings.maxTokens)}
        onReset={() => onSettingsChange({ maxTokens: defaultSettings.maxTokens })}
      />

      <SliderItem
        icon="thermometer"
        title="Temperature"
        description="Controls randomness in responses"
        value={modelSettings.temperature ?? 0.7}
        defaultValue={defaultSettings.temperature ?? 0.7}
        onValueChange={(value) => onSettingsChange({ temperature: value })}
        minimumValue={0}
        maximumValue={2}
        step={0.01}
      />

      <SliderItem
        icon="chart-timeline-variant"
        title="Top P"
        description="Controls diversity of responses"
        value={modelSettings.topP ?? 0.95}
        defaultValue={defaultSettings.topP ?? 0.95}
        onValueChange={(value) => onSettingsChange({ topP: value })}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
      />

      <SliderItem
        icon="format-list-numbered"
        title="Top K"
        description="Limits tokens considered for generation"
        value={modelSettings.topK ?? 40}
        defaultValue={defaultSettings.topK ?? 40}
        onValueChange={(value) => onSettingsChange({ topK: value })}
        minimumValue={1}
        maximumValue={100}
        step={1}
      />

      <SettingItem
        icon="stop-circle-outline"
        title="Stop Words"
        description="Words that will cause generation to stop"
        value={`${modelSettings.stopWords?.length || 0} words`}
        onPress={onStopWordsPress}
        showReset={isDifferent(modelSettings.stopWords?.length, defaultSettings.stopWords?.length)}
        onReset={() => onSettingsChange({ stopWords: defaultSettings.stopWords || [] })}
      />

      <Text style={[styles.sectionHeader, { color: themeColors.text }]}>Advanced Settings</Text>

      <SliderItem
        icon="minus"
        title="Min P"
        description="Minimum probability threshold"
        value={modelSettings.minP ?? 0.05}
        defaultValue={defaultSettings.minP ?? 0.05}
        onValueChange={(value) => onSettingsChange({ minP: value })}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
      />

      <SliderItem
        icon="repeat"
        title="Repetition Penalty"
        description="Discourage word repetition"
        value={modelSettings.penaltyRepeat ?? 1.1}
        defaultValue={defaultSettings.penaltyRepeat ?? 1.1}
        onValueChange={(value) => onSettingsChange({ penaltyRepeat: value })}
        minimumValue={0.5}
        maximumValue={2}
        step={0.01}
      />

      <SwitchItem
        icon="code-braces"
        title="Jinja Templating"
        description="Enable Jinja templating for chat formatting"
        value={modelSettings.jinja ?? false}
        onValueChange={(value) => onSettingsChange({ jinja: value })}
        showReset={isDifferent(modelSettings.jinja, defaultSettings.jinja)}
        onReset={() => onSettingsChange({ jinja: defaultSettings.jinja ?? false })}
      />

      <SwitchItem
        icon="brain"
        title="Enable Thinking"
        description="Include AI reasoning in context"
        value={modelSettings.enableThinking ?? true}
        onValueChange={(value) => onSettingsChange({ enableThinking: value })}
        showReset={isDifferent(modelSettings.enableThinking, defaultSettings.enableThinking)}
        onReset={() => onSettingsChange({ enableThinking: defaultSettings.enableThinking ?? true })}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 16,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  settingCard: {
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  sliderContent: {
    padding: 20,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  settingValue: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  resetText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default CustomModelSettingsSection;
