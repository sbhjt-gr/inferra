import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Switch } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import SettingsSection from './SettingsSection';
import SettingSlider from '../SettingSlider';

type ModelSettings = {
  maxTokens: number;
  temperature: number;
  topK: number;
  topP: number;
  minP: number;
  stopWords: string[];
};

type ModelSettingsSectionProps = {
  modelSettings: ModelSettings;
  defaultSettings: {
    maxTokens: number;
    temperature: number;
    topK: number;
    topP: number;
    minP: number;
    stopWords: string[];
  };
  error: string | null;
  onSettingsChange: (settings: Partial<ModelSettings>) => void;
  onMaxTokensPress: () => void;
  onStopWordsPress: () => void;
  onDialogOpen: (config: any) => void;
  enableRemoteModels: boolean;
  onToggleRemoteModels: () => void;
};

const ModelSettingsSection = ({
  modelSettings,
  defaultSettings,
  error,
  onSettingsChange,
  onMaxTokensPress,
  onStopWordsPress,
  onDialogOpen,
  enableRemoteModels,
  onToggleRemoteModels
}: ModelSettingsSectionProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;

  return (
    <SettingsSection title="MODEL SETTINGS">
      <View style={[styles.settingItem, styles.settingItemBorder]}>
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="cloud-outline" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingText, { color: themeColors.text }]}>
              Enable Remote Models
            </Text>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Allow access to cloud-hosted models for enhanced capabilities
            </Text>
          </View>
        </View>
        <Switch
          value={enableRemoteModels}
          onValueChange={onToggleRemoteModels}
          trackColor={{ false: themeColors.secondaryText + '40', true: themeColors.primary + '80' }}
          thumbColor={enableRemoteModels ? themeColors.primary : themeColors.secondaryText}
        />
      </View>

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
              Maximum number of tokens in model responses. More tokens = longer responses but slower generation.
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
      
      <TouchableOpacity 
        style={[styles.settingItem, styles.settingItemBorder]}
        onPress={onStopWordsPress}
      >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="stop-circle-outline" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <View style={styles.labelRow}>
              <Text style={[styles.settingText, { color: themeColors.text }]}>
                Stop Words
              </Text>
              <Text style={[styles.valueText, { color: themeColors.text }]}>
                {modelSettings.stopWords.length}
              </Text>
            </View>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Words that will cause the model to stop generating. One word per line.
            </Text>
            {JSON.stringify(modelSettings.stopWords) !== JSON.stringify(defaultSettings.stopWords) && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ stopWords: defaultSettings.stopWords })}
                style={[styles.resetButton, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}
              >
                <MaterialCommunityIcons name="refresh" size={14} color={iconColor} />
                <Text style={[styles.resetText, { color: iconColor }]}>Reset to Default</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.secondaryText} />
      </TouchableOpacity>

      <SettingSlider
        label="Temperature"
        value={modelSettings.temperature}
        defaultValue={defaultSettings.temperature}
        onValueChange={(value) => onSettingsChange({ temperature: value })}
        minimumValue={0}
        maximumValue={2}
        step={0.01}
        description="Controls randomness in responses. Higher values make the output more creative but less focused."
        onPressChange={() => onDialogOpen({
          key: 'temperature',
          label: 'Temperature',
          value: modelSettings.temperature,
          minimumValue: 0,
          maximumValue: 2,
          step: 0.01,
          description: "Controls randomness in responses. Higher values make the output more creative but less focused."
        })}
      />

      <SettingSlider
        label="Top K"
        value={modelSettings.topK}
        defaultValue={defaultSettings.topK}
        onValueChange={(value) => onSettingsChange({ topK: value })}
        minimumValue={1}
        maximumValue={100}
        step={1}
        description="Limits the cumulative probability of tokens considered for each step of text generation."
        onPressChange={() => onDialogOpen({
          key: 'topK',
          label: 'Top K',
          value: modelSettings.topK,
          minimumValue: 1,
          maximumValue: 100,
          step: 1,
          description: "Limits the cumulative probability of tokens considered for each step of text generation."
        })}
      />

      <SettingSlider
        label="Top P"
        value={modelSettings.topP}
        defaultValue={defaultSettings.topP}
        onValueChange={(value) => onSettingsChange({ topP: value })}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        description="Controls diversity of responses. Higher values = more diverse but potentially less focused."
        onPressChange={() => onDialogOpen({
          key: 'topP',
          label: 'Top P',
          value: modelSettings.topP,
          minimumValue: 0,
          maximumValue: 1,
          step: 0.01,
          description: "Controls diversity of responses. Higher values = more diverse but potentially less focused."
        })}
      />

      <SettingSlider
        label="Min P"
        value={modelSettings.minP}
        defaultValue={defaultSettings.minP}
        onValueChange={(value) => onSettingsChange({ minP: value })}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        description="Minimum probability threshold. Higher values = more focused on likely tokens."
        onPressChange={() => onDialogOpen({
          key: 'minP',
          label: 'Min P',
          value: modelSettings.minP,
          minimumValue: 0,
          maximumValue: 1,
          step: 0.01,
          description: "Minimum probability threshold. Higher values = more focused on likely tokens."
        })}
      />
    </SettingsSection>
  );
};

const styles = StyleSheet.create({
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
});

export default ModelSettingsSection; 