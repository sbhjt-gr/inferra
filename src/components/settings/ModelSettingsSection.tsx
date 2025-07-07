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

type ModelSettingsSectionProps = {
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
  onDrySequenceBreakersPress: () => void;
  onDialogOpen: (config: any) => void;
};

const ModelSettingsSection = ({
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
  onDrySequenceBreakersPress,
  onDialogOpen
}: ModelSettingsSectionProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;

  return (
    <SettingsSection title="MODEL SETTINGS">
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
                {modelSettings.stopWords?.length || 0}
              </Text>
            </View>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Words that will cause the model to stop generating. One word per line.
            </Text>
            {JSON.stringify(modelSettings.stopWords || []) !== JSON.stringify(defaultSettings.stopWords || []) && (
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

      {/* Core Generation Settings */}
      <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>CORE GENERATION</Text>
      </View>

      <View style={[styles.settingItem, styles.settingItemBorder]}>
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="code-braces" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingText, { color: themeColors.text }]}>
              Jinja Templating
            </Text>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Enable Jinja templating for chat formatting. Better compatibility with modern models.
            </Text>
            {modelSettings.jinja !== defaultSettings.jinja && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ jinja: defaultSettings.jinja })}
                style={[styles.resetButton, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}
              >
                <MaterialCommunityIcons name="refresh" size={14} color={iconColor} />
                <Text style={[styles.resetText, { color: iconColor }]}>Reset to Default</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Switch
          value={modelSettings.jinja}
          onValueChange={(value) => onSettingsChange({ jinja: value })}
          trackColor={{ false: themeColors.borderColor, true: themeColors.primary + '80' }}
          thumbColor={modelSettings.jinja ? themeColors.primary : themeColors.background}
        />
      </View>

      <TouchableOpacity 
        style={[styles.settingItem, styles.settingItemBorder]}
        onPress={onGrammarPress}
      >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="format-text" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <View style={styles.labelRow}>
              <Text style={[styles.settingText, { color: themeColors.text }]}>
                Grammar Rules
              </Text>
              <Text style={[styles.valueText, { color: themeColors.text }]}>
                {modelSettings.grammar ? 'Set' : 'None'}
              </Text>
            </View>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Enforce specific grammar rules to ensure generated text follows a particular structure.
            </Text>
            {modelSettings.grammar !== defaultSettings.grammar && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ grammar: defaultSettings.grammar })}
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

      <View style={[styles.settingItem, styles.settingItemBorder]}>
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="brain" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingText, { color: themeColors.text }]}>
              Enable Thinking
            </Text>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Include AI thinking/reasoning parts in context. Disabling saves context space but may impact performance.
            </Text>
            {modelSettings.enableThinking !== defaultSettings.enableThinking && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ enableThinking: defaultSettings.enableThinking })}
                style={[styles.resetButton, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}
              >
                <MaterialCommunityIcons name="refresh" size={14} color={iconColor} />
                <Text style={[styles.resetText, { color: iconColor }]}>Reset to Default</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Switch
          value={modelSettings.enableThinking}
          onValueChange={(value) => onSettingsChange({ enableThinking: value })}
          trackColor={{ false: themeColors.borderColor, true: themeColors.primary + '80' }}
          thumbColor={modelSettings.enableThinking ? themeColors.primary : themeColors.background}
        />
      </View>

      {/* Probability and Sampling Settings */}
      <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>PROBABILITY & SAMPLING</Text>
      </View>

      <TouchableOpacity 
        style={[styles.settingItem, styles.settingItemBorder]}
        onPress={onNProbsPress}
      >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="chart-line" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <View style={styles.labelRow}>
              <Text style={[styles.settingText, { color: themeColors.text }]}>
                Token Probabilities
              </Text>
              <Text style={[styles.valueText, { color: themeColors.text }]}>
                {modelSettings.nProbs}
              </Text>
            </View>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Show probability scores for alternative words. 0 disables, higher values show more alternatives.
            </Text>
            {modelSettings.nProbs !== defaultSettings.nProbs && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ nProbs: defaultSettings.nProbs })}
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

      <TouchableOpacity 
        style={[styles.settingItem, styles.settingItemBorder]}
        onPress={onSeedPress}
      >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="dice-multiple" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <View style={styles.labelRow}>
              <Text style={[styles.settingText, { color: themeColors.text }]}>
                Random Seed
              </Text>
              <Text style={[styles.valueText, { color: themeColors.text }]}>
                {modelSettings.seed === -1 ? 'Random' : modelSettings.seed}
              </Text>
            </View>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Set random number generator seed for reproducible results. -1 for random seed.
            </Text>
            {modelSettings.seed !== defaultSettings.seed && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ seed: defaultSettings.seed })}
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
        label="XTC Probability"
        value={modelSettings.xtcProbability}
        defaultValue={defaultSettings.xtcProbability}
        onValueChange={(value) => onSettingsChange({ xtcProbability: value })}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        description="Chance for token removal via XTC sampler. 0 disables XTC sampling."
        onPressChange={() => onDialogOpen({
          key: 'xtcProbability',
          label: 'XTC Probability',
          value: modelSettings.xtcProbability,
          minimumValue: 0,
          maximumValue: 1,
          step: 0.01,
          description: "Chance for token removal via XTC sampler. 0 disables XTC sampling."
        })}
      />

      <SettingSlider
        label="XTC Threshold"
        value={modelSettings.xtcThreshold}
        defaultValue={defaultSettings.xtcThreshold}
        onValueChange={(value) => onSettingsChange({ xtcThreshold: value })}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        description="Minimum probability threshold for XTC removal. Values > 0.5 disable XTC."
        onPressChange={() => onDialogOpen({
          key: 'xtcThreshold',
          label: 'XTC Threshold',
          value: modelSettings.xtcThreshold,
          minimumValue: 0,
          maximumValue: 1,
          step: 0.01,
          description: "Minimum probability threshold for XTC removal. Values > 0.5 disable XTC."
        })}
      />

      <SettingSlider
        label="Typical P"
        value={modelSettings.typicalP}
        defaultValue={defaultSettings.typicalP}
        onValueChange={(value) => onSettingsChange({ typicalP: value })}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        description="Enable locally typical sampling. 1.0 disables, lower values filter unlikely tokens."
        onPressChange={() => onDialogOpen({
          key: 'typicalP',
          label: 'Typical P',
          value: modelSettings.typicalP,
          minimumValue: 0,
          maximumValue: 1,
          step: 0.01,
          description: "Enable locally typical sampling. 1.0 disables, lower values filter unlikely tokens."
        })}
      />

      {/* Repetition Penalties */}
      <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>REPETITION PENALTIES</Text>
      </View>

      <SettingSlider
        label="Penalty Last N"
        value={modelSettings.penaltyLastN}
        defaultValue={defaultSettings.penaltyLastN}
        onValueChange={(value) => onSettingsChange({ penaltyLastN: Math.round(value) })}
        minimumValue={0}
        maximumValue={512}
        step={1}
        description="How far back to check for repetition. 0 disables, -1 uses context size."
        onPressChange={() => onDialogOpen({
          key: 'penaltyLastN',
          label: 'Penalty Last N',
          value: modelSettings.penaltyLastN,
          minimumValue: 0,
          maximumValue: 512,
          step: 1,
          description: "How far back to check for repetition. 0 disables, -1 uses context size."
        })}
      />

      <SettingSlider
        label="Repetition Penalty"
        value={modelSettings.penaltyRepeat}
        defaultValue={defaultSettings.penaltyRepeat}
        onValueChange={(value) => onSettingsChange({ penaltyRepeat: value })}
        minimumValue={0.5}
        maximumValue={2}
        step={0.01}
        description="Discourage word repetition. Higher values make responses use more diverse language."
        onPressChange={() => onDialogOpen({
          key: 'penaltyRepeat',
          label: 'Repetition Penalty',
          value: modelSettings.penaltyRepeat,
          minimumValue: 0.5,
          maximumValue: 2,
          step: 0.01,
          description: "Discourage word repetition. Higher values make responses use more diverse language."
        })}
      />

      <SettingSlider
        label="Frequency Penalty"
        value={modelSettings.penaltyFreq}
        defaultValue={defaultSettings.penaltyFreq}
        onValueChange={(value) => onSettingsChange({ penaltyFreq: value })}
        minimumValue={0}
        maximumValue={2}
        step={0.01}
        description="Penalize overused words. Higher values encourage using a broader vocabulary."
        onPressChange={() => onDialogOpen({
          key: 'penaltyFreq',
          label: 'Frequency Penalty',
          value: modelSettings.penaltyFreq,
          minimumValue: 0,
          maximumValue: 2,
          step: 0.01,
          description: "Penalize overused words. Higher values encourage using a broader vocabulary."
        })}
      />

      <SettingSlider
        label="Presence Penalty"
        value={modelSettings.penaltyPresent}
        defaultValue={defaultSettings.penaltyPresent}
        onValueChange={(value) => onSettingsChange({ penaltyPresent: value })}
        minimumValue={0}
        maximumValue={2}
        step={0.01}
        description="Reduce repetition of themes and ideas. Higher values encourage more diverse content."
        onPressChange={() => onDialogOpen({
          key: 'penaltyPresent',
          label: 'Presence Penalty',
          value: modelSettings.penaltyPresent,
          minimumValue: 0,
          maximumValue: 2,
          step: 0.01,
          description: "Reduce repetition of themes and ideas. Higher values encourage more diverse content."
        })}
      />

      {/* Mirostat Settings */}
      <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>MIROSTAT SETTINGS</Text>
      </View>

      <SettingSlider
        label="Mirostat Mode"
        value={modelSettings.mirostat}
        defaultValue={defaultSettings.mirostat}
        onValueChange={(value) => onSettingsChange({ mirostat: Math.round(value) })}
        minimumValue={0}
        maximumValue={2}
        step={1}
        description="Enable advanced creativity control. 0=disabled, 1=Mirostat, 2=Mirostat 2.0 (smoother)."
        onPressChange={() => onDialogOpen({
          key: 'mirostat',
          label: 'Mirostat Mode',
          value: modelSettings.mirostat,
          minimumValue: 0,
          maximumValue: 2,
          step: 1,
          description: "Enable advanced creativity control. 0=disabled, 1=Mirostat, 2=Mirostat 2.0 (smoother)."
        })}
      />

      <SettingSlider
        label="Mirostat Tau"
        value={modelSettings.mirostatTau}
        defaultValue={defaultSettings.mirostatTau}
        onValueChange={(value) => onSettingsChange({ mirostatTau: value })}
        minimumValue={1}
        maximumValue={10}
        step={0.1}
        description="Target creativity level for Mirostat. Higher values allow more diverse responses."
        onPressChange={() => onDialogOpen({
          key: 'mirostatTau',
          label: 'Mirostat Tau',
          value: modelSettings.mirostatTau,
          minimumValue: 1,
          maximumValue: 10,
          step: 0.1,
          description: "Target creativity level for Mirostat. Higher values allow more diverse responses."
        })}
      />

      <SettingSlider
        label="Mirostat Eta"
        value={modelSettings.mirostatEta}
        defaultValue={defaultSettings.mirostatEta}
        onValueChange={(value) => onSettingsChange({ mirostatEta: value })}
        minimumValue={0.01}
        maximumValue={1}
        step={0.01}
        description="How quickly Mirostat adjusts creativity. Higher values mean faster adjustments."
        onPressChange={() => onDialogOpen({
          key: 'mirostatEta',
          label: 'Mirostat Eta',
          value: modelSettings.mirostatEta,
          minimumValue: 0.01,
          maximumValue: 1,
          step: 0.01,
          description: "How quickly Mirostat adjusts creativity. Higher values mean faster adjustments."
        })}
      />

      {/* DRY Settings */}
      <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>DRY (DON'T REPEAT YOURSELF)</Text>
      </View>

      <SettingSlider
        label="DRY Multiplier"
        value={modelSettings.dryMultiplier}
        defaultValue={defaultSettings.dryMultiplier}
        onValueChange={(value) => onSettingsChange({ dryMultiplier: value })}
        minimumValue={0}
        maximumValue={5}
        step={0.1}
        description="Strength of DRY feature. Higher values strongly prevent repetition. 0 disables DRY."
        onPressChange={() => onDialogOpen({
          key: 'dryMultiplier',
          label: 'DRY Multiplier',
          value: modelSettings.dryMultiplier,
          minimumValue: 0,
          maximumValue: 5,
          step: 0.1,
          description: "Strength of DRY feature. Higher values strongly prevent repetition. 0 disables DRY."
        })}
      />

      <SettingSlider
        label="DRY Base"
        value={modelSettings.dryBase}
        defaultValue={defaultSettings.dryBase}
        onValueChange={(value) => onSettingsChange({ dryBase: value })}
        minimumValue={1}
        maximumValue={4}
        step={0.05}
        description="Base penalty for repetition in DRY mode. Higher values are more aggressive."
        onPressChange={() => onDialogOpen({
          key: 'dryBase',
          label: 'DRY Base',
          value: modelSettings.dryBase,
          minimumValue: 1,
          maximumValue: 4,
          step: 0.05,
          description: "Base penalty for repetition in DRY mode. Higher values are more aggressive."
        })}
      />

      <SettingSlider
        label="DRY Allowed Length"
        value={modelSettings.dryAllowedLength}
        defaultValue={defaultSettings.dryAllowedLength}
        onValueChange={(value) => onSettingsChange({ dryAllowedLength: Math.round(value) })}
        minimumValue={1}
        maximumValue={20}
        step={1}
        description="How many words can repeat before DRY penalty kicks in."
        onPressChange={() => onDialogOpen({
          key: 'dryAllowedLength',
          label: 'DRY Allowed Length',
          value: modelSettings.dryAllowedLength,
          minimumValue: 1,
          maximumValue: 20,
          step: 1,
          description: "How many words can repeat before DRY penalty kicks in."
        })}
      />

      <SettingSlider
        label="DRY Penalty Last N"
        value={modelSettings.dryPenaltyLastN}
        defaultValue={defaultSettings.dryPenaltyLastN}
        onValueChange={(value) => onSettingsChange({ dryPenaltyLastN: Math.round(value) })}
        minimumValue={-1}
        maximumValue={512}
        step={1}
        description="How far back to look for repetition in DRY mode. -1 uses context size."
        onPressChange={() => onDialogOpen({
          key: 'dryPenaltyLastN',
          label: 'DRY Penalty Last N',
          value: modelSettings.dryPenaltyLastN,
          minimumValue: -1,
          maximumValue: 512,
          step: 1,
          description: "How far back to look for repetition in DRY mode. -1 uses context size."
        })}
      />

      <TouchableOpacity 
        style={[styles.settingItem, styles.settingItemBorder]}
        onPress={onDrySequenceBreakersPress}
      >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="format-list-bulleted" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <View style={styles.labelRow}>
              <Text style={[styles.settingText, { color: themeColors.text }]}>
                DRY Sequence Breakers
              </Text>
              <Text style={[styles.valueText, { color: themeColors.text }]}>
                {modelSettings.drySequenceBreakers?.length || 0}
              </Text>
            </View>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Symbols that reset the repetition checker in DRY mode.
            </Text>
            {JSON.stringify(modelSettings.drySequenceBreakers || []) !== JSON.stringify(defaultSettings.drySequenceBreakers || []) && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ drySequenceBreakers: defaultSettings.drySequenceBreakers })}
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

      {/* Advanced Settings */}
      <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>ADVANCED SETTINGS</Text>
      </View>

      <View style={[styles.settingItem, styles.settingItemBorder]}>
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="infinity" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingText, { color: themeColors.text }]}>
              Ignore End of Stream
            </Text>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Continue generating even if the model wants to stop. Useful for forcing longer responses.
            </Text>
            {modelSettings.ignoreEos !== defaultSettings.ignoreEos && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ ignoreEos: defaultSettings.ignoreEos })}
                style={[styles.resetButton, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}
              >
                <MaterialCommunityIcons name="refresh" size={14} color={iconColor} />
                <Text style={[styles.resetText, { color: iconColor }]}>Reset to Default</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Switch
          value={modelSettings.ignoreEos}
          onValueChange={(value) => onSettingsChange({ ignoreEos: value })}
          trackColor={{ false: themeColors.borderColor, true: themeColors.primary + '80' }}
          thumbColor={modelSettings.ignoreEos ? themeColors.primary : themeColors.background}
        />
      </View>

      <TouchableOpacity 
        style={[styles.settingItem, styles.settingItemBorder]}
        onPress={onLogitBiasPress}
      >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="tune" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <View style={styles.labelRow}>
              <Text style={[styles.settingText, { color: themeColors.text }]}>
                Logit Bias
              </Text>
              <Text style={[styles.valueText, { color: themeColors.text }]}>
                {(modelSettings.logitBias?.length || 0) > 0 ? `${modelSettings.logitBias?.length || 0} rules` : 'None'}
              </Text>
            </View>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Influence how likely specific words are to appear in the response.
            </Text>
            {(modelSettings.logitBias?.length || 0) !== (defaultSettings.logitBias?.length || 0) && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ logitBias: defaultSettings.logitBias })}
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
});

export default ModelSettingsSection; 