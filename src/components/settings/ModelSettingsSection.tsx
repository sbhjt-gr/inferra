import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Switch, Modal, TextInput, ScrollView, Dimensions } from 'react-native';
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
  const [showModelSettings, setShowModelSettings] = useState(false);
  
  const [showGrammarDialog, setShowGrammarDialog] = useState(false);
  const [showSeedDialog, setShowSeedDialog] = useState(false);
  const [showNProbsDialog, setShowNProbsDialog] = useState(false);
  const [showLogitBiasDialog, setShowLogitBiasDialog] = useState(false);
  const [showDrySequenceBreakersDialog, setShowDrySequenceBreakersDialog] = useState(false);
  
  const [tempGrammar, setTempGrammar] = useState('');
  const [tempSeed, setTempSeed] = useState('');
  const [tempNProbs, setTempNProbs] = useState('');
  const [tempLogitBias, setTempLogitBias] = useState('');
  const [tempDrySequenceBreakers, setTempDrySequenceBreakers] = useState('');

  // Helper function to safely compare numeric values
  const isNumberDifferent = (current: number, defaultValue: number): boolean => {
    return Math.abs(current - defaultValue) > 0.001; // Use small epsilon for floating point comparison
  };

  // Helper function to safely compare string values
  const isStringDifferent = (current: string, defaultValue: string): boolean => {
    return (current || '') !== (defaultValue || '');
  };

  // Helper function to safely compare arrays
  const isArrayDifferent = (current: any[] | undefined, defaultValue: any[] | undefined): boolean => {
    const currArray = current || [];
    const defArray = defaultValue || [];
    return currArray.length !== defArray.length || 
           !currArray.every((item, index) => item === defArray[index]);
  };

  return (
    <SettingsSection title="MODEL SETTINGS">
      <TouchableOpacity 
        style={[styles.settingItem]}
        onPress={() => setShowModelSettings(!showModelSettings)}
      >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="cog-outline" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <View style={styles.labelRow}>
              <Text style={[styles.settingText, { color: themeColors.text }]}>
                Model Parameters
              </Text>
              <View style={[styles.advancedTag, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <Text style={[styles.advancedTagText, { color: currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary }]}>
                  ADVANCED
                </Text>
              </View>
            </View>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Tap to {showModelSettings ? 'hide' : 'view'} advanced settings
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons 
          name={showModelSettings ? "chevron-up" : "chevron-down"} 
          size={20} 
          color={themeColors.secondaryText} 
        />
      </TouchableOpacity>

      {showModelSettings && (
        <>
      
      {/* Essential Settings */}
      <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>ESSENTIAL SETTINGS</Text>
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

      {/* Advanced Sampling */}
      <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>ADVANCED SAMPLING</Text>
      </View>

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

      <SettingSlider
        label="XTC Probability"
        value={modelSettings.xtcProbability ?? 0}
        defaultValue={defaultSettings.xtcProbability ?? 0}
        onValueChange={(value) => onSettingsChange({ xtcProbability: value })}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        description="Chance for token removal via XTC sampler. 0 disables XTC sampling."
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

      <SettingSlider
        label="XTC Threshold"
        value={modelSettings.xtcThreshold ?? 0.1}
        defaultValue={defaultSettings.xtcThreshold ?? 0.1}
        onValueChange={(value) => onSettingsChange({ xtcThreshold: value })}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        description="Minimum probability threshold for XTC removal. Values > 0.5 disable XTC."
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

      {/* Generation Control */}
      <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>GENERATION CONTROL</Text>
      </View>

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
            {isArrayDifferent(modelSettings.stopWords, defaultSettings.stopWords) && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ stopWords: defaultSettings.stopWords || [] })}
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



      {/* Core Settings */}
      <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>CORE SETTINGS</Text>
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
            {(modelSettings.jinja ?? false) !== (defaultSettings.jinja ?? false) && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ jinja: defaultSettings.jinja ?? false })}
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
        onPress={() => {
          setTempGrammar(modelSettings.grammar);
          setShowGrammarDialog(true);
        }}
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
            {isStringDifferent(modelSettings.grammar, defaultSettings.grammar) && (
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
            {(modelSettings.enableThinking ?? true) !== (defaultSettings.enableThinking ?? true) && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ enableThinking: defaultSettings.enableThinking ?? true })}
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

      {/* Expert Settings */}
      <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>EXPERT SETTINGS</Text>
      </View>

      <TouchableOpacity 
        style={[styles.settingItem, styles.settingItemBorder]}
        onPress={() => {
          setTempNProbs((modelSettings.nProbs ?? 0).toString());
          setShowNProbsDialog(true);
        }}
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
                {modelSettings.nProbs ?? 0}
              </Text>
            </View>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Show probability scores for alternative words. 0 disables, higher values show more alternatives.
            </Text>
            {(modelSettings.nProbs ?? 0) !== (defaultSettings.nProbs ?? 0) && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ nProbs: defaultSettings.nProbs ?? 0 })}
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
        onPress={() => {
          setTempSeed((modelSettings.seed ?? -1).toString());
          setShowSeedDialog(true);
        }}
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
                {(modelSettings.seed ?? -1) === -1 ? 'Random' : (modelSettings.seed ?? -1)}
              </Text>
            </View>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Set random number generator seed for reproducible results. -1 for random seed.
            </Text>
            {(modelSettings.seed ?? -1) !== (defaultSettings.seed ?? -1) && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ seed: defaultSettings.seed ?? -1 })}
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

      {/* Repetition Penalties */}
      <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>REPETITION PENALTIES</Text>
      </View>

      <SettingSlider
        label="Penalty Last N"
        value={modelSettings.penaltyLastN ?? 64}
        defaultValue={defaultSettings.penaltyLastN ?? 64}
        onValueChange={(value) => onSettingsChange({ penaltyLastN: Math.round(value) })}
        minimumValue={0}
        maximumValue={512}
        step={1}
        description="How far back to check for repetition. 0 disables, -1 uses context size."
        onPressChange={() => onDialogOpen({
          key: 'penaltyLastN',
          label: 'Penalty Last N',
          value: modelSettings.penaltyLastN ?? 64,
          minimumValue: 0,
          maximumValue: 512,
          step: 1,
          description: "How far back to check for repetition. 0 disables, -1 uses context size."
        })}
      />

      <SettingSlider
        label="Repetition Penalty"
        value={modelSettings.penaltyRepeat ?? 1.1}
        defaultValue={defaultSettings.penaltyRepeat ?? 1.1}
        onValueChange={(value) => onSettingsChange({ penaltyRepeat: value })}
        minimumValue={0.5}
        maximumValue={2}
        step={0.01}
        description="Discourage word repetition. Higher values make responses use more diverse language."
        onPressChange={() => onDialogOpen({
          key: 'penaltyRepeat',
          label: 'Repetition Penalty',
          value: modelSettings.penaltyRepeat ?? 1.1,
          minimumValue: 0.5,
          maximumValue: 2,
          step: 0.01,
          description: "Discourage word repetition. Higher values make responses use more diverse language."
        })}
      />

      <SettingSlider
        label="Frequency Penalty"
        value={modelSettings.penaltyFreq ?? 0}
        defaultValue={defaultSettings.penaltyFreq ?? 0}
        onValueChange={(value) => onSettingsChange({ penaltyFreq: value })}
        minimumValue={0}
        maximumValue={2}
        step={0.01}
        description="Penalize overused words. Higher values encourage using a broader vocabulary."
        onPressChange={() => onDialogOpen({
          key: 'penaltyFreq',
          label: 'Frequency Penalty',
          value: modelSettings.penaltyFreq ?? 0,
          minimumValue: 0,
          maximumValue: 2,
          step: 0.01,
          description: "Penalize overused words. Higher values encourage using a broader vocabulary."
        })}
      />

      <SettingSlider
        label="Presence Penalty"
        value={modelSettings.penaltyPresent ?? 0}
        defaultValue={defaultSettings.penaltyPresent ?? 0}
        onValueChange={(value) => onSettingsChange({ penaltyPresent: value })}
        minimumValue={0}
        maximumValue={2}
        step={0.01}
        description="Reduce repetition of themes and ideas. Higher values encourage more diverse content."
        onPressChange={() => onDialogOpen({
          key: 'penaltyPresent',
          label: 'Presence Penalty',
          value: modelSettings.penaltyPresent ?? 0,
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
        value={modelSettings.mirostat ?? 0}
        defaultValue={defaultSettings.mirostat ?? 0}
        onValueChange={(value) => onSettingsChange({ mirostat: Math.round(value) })}
        minimumValue={0}
        maximumValue={2}
        step={1}
        description="Enable advanced creativity control. 0=disabled, 1=Mirostat, 2=Mirostat 2.0 (smoother)."
        onPressChange={() => onDialogOpen({
          key: 'mirostat',
          label: 'Mirostat Mode',
          value: modelSettings.mirostat ?? 0,
          minimumValue: 0,
          maximumValue: 2,
          step: 1,
          description: "Enable advanced creativity control. 0=disabled, 1=Mirostat, 2=Mirostat 2.0 (smoother)."
        })}
      />

      <SettingSlider
        label="Mirostat Tau"
        value={modelSettings.mirostatTau ?? 5}
        defaultValue={defaultSettings.mirostatTau ?? 5}
        onValueChange={(value) => onSettingsChange({ mirostatTau: value })}
        minimumValue={1}
        maximumValue={10}
        step={0.1}
        description="Target creativity level for Mirostat. Higher values allow more diverse responses."
        onPressChange={() => onDialogOpen({
          key: 'mirostatTau',
          label: 'Mirostat Tau',
          value: modelSettings.mirostatTau ?? 5,
          minimumValue: 1,
          maximumValue: 10,
          step: 0.1,
          description: "Target creativity level for Mirostat. Higher values allow more diverse responses."
        })}
      />

      <SettingSlider
        label="Mirostat Eta"
        value={modelSettings.mirostatEta ?? 0.1}
        defaultValue={defaultSettings.mirostatEta ?? 0.1}
        onValueChange={(value) => onSettingsChange({ mirostatEta: value })}
        minimumValue={0.01}
        maximumValue={1}
        step={0.01}
        description="How quickly Mirostat adjusts creativity. Higher values mean faster adjustments."
        onPressChange={() => onDialogOpen({
          key: 'mirostatEta',
          label: 'Mirostat Eta',
          value: modelSettings.mirostatEta ?? 0.1,
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
        value={modelSettings.dryMultiplier ?? 0}
        defaultValue={defaultSettings.dryMultiplier ?? 0}
        onValueChange={(value) => onSettingsChange({ dryMultiplier: value })}
        minimumValue={0}
        maximumValue={5}
        step={0.1}
        description="Strength of DRY feature. Higher values strongly prevent repetition. 0 disables DRY."
        onPressChange={() => onDialogOpen({
          key: 'dryMultiplier',
          label: 'DRY Multiplier',
          value: modelSettings.dryMultiplier ?? 0,
          minimumValue: 0,
          maximumValue: 5,
          step: 0.1,
          description: "Strength of DRY feature. Higher values strongly prevent repetition. 0 disables DRY."
        })}
      />

      <SettingSlider
        label="DRY Base"
        value={modelSettings.dryBase ?? 1.75}
        defaultValue={defaultSettings.dryBase ?? 1.75}
        onValueChange={(value) => onSettingsChange({ dryBase: value })}
        minimumValue={1}
        maximumValue={4}
        step={0.05}
        description="Base penalty for repetition in DRY mode. Higher values are more aggressive."
        onPressChange={() => onDialogOpen({
          key: 'dryBase',
          label: 'DRY Base',
          value: modelSettings.dryBase ?? 1.75,
          minimumValue: 1,
          maximumValue: 4,
          step: 0.05,
          description: "Base penalty for repetition in DRY mode. Higher values are more aggressive."
        })}
      />

      <SettingSlider
        label="DRY Allowed Length"
        value={modelSettings.dryAllowedLength ?? 2}
        defaultValue={defaultSettings.dryAllowedLength ?? 2}
        onValueChange={(value) => onSettingsChange({ dryAllowedLength: Math.round(value) })}
        minimumValue={1}
        maximumValue={20}
        step={1}
        description="How many words can repeat before DRY penalty kicks in."
        onPressChange={() => onDialogOpen({
          key: 'dryAllowedLength',
          label: 'DRY Allowed Length',
          value: modelSettings.dryAllowedLength ?? 2,
          minimumValue: 1,
          maximumValue: 20,
          step: 1,
          description: "How many words can repeat before DRY penalty kicks in."
        })}
      />

      <SettingSlider
        label="DRY Penalty Last N"
        value={modelSettings.dryPenaltyLastN ?? -1}
        defaultValue={defaultSettings.dryPenaltyLastN ?? -1}
        onValueChange={(value) => onSettingsChange({ dryPenaltyLastN: Math.round(value) })}
        minimumValue={-1}
        maximumValue={512}
        step={1}
        description="How far back to look for repetition in DRY mode. -1 uses context size."
        onPressChange={() => onDialogOpen({
          key: 'dryPenaltyLastN',
          label: 'DRY Penalty Last N',
          value: modelSettings.dryPenaltyLastN ?? -1,
          minimumValue: -1,
          maximumValue: 512,
          step: 1,
          description: "How far back to look for repetition in DRY mode. -1 uses context size."
        })}
      />

      <TouchableOpacity 
        style={[styles.settingItem, styles.settingItemBorder]}
        onPress={() => {
          setTempDrySequenceBreakers((modelSettings.drySequenceBreakers || []).join('\n'));
          setShowDrySequenceBreakersDialog(true);
        }}
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
            {isArrayDifferent(modelSettings.drySequenceBreakers, defaultSettings.drySequenceBreakers) && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ drySequenceBreakers: defaultSettings.drySequenceBreakers || [] })}
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
            {(modelSettings.ignoreEos ?? false) !== (defaultSettings.ignoreEos ?? false) && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ ignoreEos: defaultSettings.ignoreEos ?? false })}
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
        onPress={() => {
          const logitBiasText = (modelSettings.logitBias || [])
            .map(([tokenId, bias]) => `${tokenId}, ${bias}`)
            .join('\n');
          setTempLogitBias(logitBiasText);
          setShowLogitBiasDialog(true);
        }}
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
            {(JSON.stringify(modelSettings.logitBias || []) !== JSON.stringify(defaultSettings.logitBias || [])) && (
              <TouchableOpacity
                onPress={() => onSettingsChange({ logitBias: defaultSettings.logitBias || [] })}
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
        </>
      )}

      {/* Grammar Dialog */}
      <Modal
        visible={showGrammarDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGrammarDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Grammar Rules</Text>
              <TouchableOpacity onPress={() => setShowGrammarDialog(false)} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.modalDescription, { color: themeColors.secondaryText }]}>
              Define grammar rules in BNF format to constrain the model's output structure. Leave empty to disable grammar constraints.
            </Text>

            <ScrollView style={styles.textAreaContainer}>
              <TextInput
                style={[styles.textArea, { 
                  color: themeColors.text,
                  backgroundColor: themeColors.borderColor + '20',
                  borderColor: themeColors.borderColor,
                }]}
                value={tempGrammar}
                onChangeText={setTempGrammar}
                placeholder="Enter grammar rules in BNF format..."
                placeholderTextColor={themeColors.secondaryText}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              {isStringDifferent(tempGrammar, defaultSettings.grammar) && (
                <TouchableOpacity
                  style={[styles.resetButton, { backgroundColor: themeColors.primary + '20' }]}
                  onPress={() => setTempGrammar(defaultSettings.grammar)}
                >
                  <MaterialCommunityIcons name="refresh" size={20} color={themeColors.primary} />
                  <Text style={[styles.resetText, { color: themeColors.primary }]}>Reset to Default</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: themeColors.primary }]}
                onPress={() => {
                  onSettingsChange({ grammar: tempGrammar });
                  setShowGrammarDialog(false);
                }}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Seed Dialog */}
      <Modal
        visible={showSeedDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSeedDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Random Seed</Text>
              <TouchableOpacity onPress={() => setShowSeedDialog(false)} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.modalDescription, { color: themeColors.secondaryText }]}>
              Set random number generator seed for reproducible results. Use -1 for random seed each time.
            </Text>

            <TextInput
              style={[styles.numberInput, {
                color: themeColors.text,
                backgroundColor: themeColors.borderColor + '20',
                borderColor: themeColors.borderColor,
              }]}
              value={tempSeed}
              onChangeText={setTempSeed}
              placeholder="Enter seed (-1 for random)"
              placeholderTextColor={themeColors.secondaryText}
              keyboardType="numeric"
            />

            <View style={styles.modalFooter}>
              {(parseInt(tempSeed) || -1) !== defaultSettings.seed && (
                <TouchableOpacity
                  style={[styles.resetButton, { backgroundColor: themeColors.primary + '20' }]}
                  onPress={() => setTempSeed(defaultSettings.seed.toString())}
                >
                  <MaterialCommunityIcons name="refresh" size={20} color={themeColors.primary} />
                  <Text style={[styles.resetText, { color: themeColors.primary }]}>Reset to Default</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: themeColors.primary }]}
                onPress={() => {
                  const seedValue = parseInt(tempSeed) || -1;
                  onSettingsChange({ seed: seedValue });
                  setShowSeedDialog(false);
                }}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* N-Probs Dialog */}
      <Modal
        visible={showNProbsDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNProbsDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Token Probabilities</Text>
              <TouchableOpacity onPress={() => setShowNProbsDialog(false)} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.modalDescription, { color: themeColors.secondaryText }]}>
              Number of most likely tokens to show probability scores for. Set to 0 to disable probability display.
            </Text>

            <TextInput
              style={[styles.numberInput, {
                color: themeColors.text,
                backgroundColor: themeColors.borderColor + '20',
                borderColor: themeColors.borderColor,
              }]}
              value={tempNProbs}
              onChangeText={setTempNProbs}
              placeholder="Enter number (0-10)"
              placeholderTextColor={themeColors.secondaryText}
              keyboardType="numeric"
            />

            <View style={styles.modalFooter}>
              {(parseInt(tempNProbs) || 0) !== defaultSettings.nProbs && (
                <TouchableOpacity
                  style={[styles.resetButton, { backgroundColor: themeColors.primary + '20' }]}
                  onPress={() => setTempNProbs(defaultSettings.nProbs.toString())}
                >
                  <MaterialCommunityIcons name="refresh" size={20} color={themeColors.primary} />
                  <Text style={[styles.resetText, { color: themeColors.primary }]}>Reset to Default</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: themeColors.primary }]}
                onPress={() => {
                  const nProbsValue = Math.max(0, Math.min(10, parseInt(tempNProbs) || 0));
                  onSettingsChange({ nProbs: nProbsValue });
                  setShowNProbsDialog(false);
                }}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Logit Bias Dialog */}
      <Modal
        visible={showLogitBiasDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogitBiasDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Logit Bias</Text>
              <TouchableOpacity onPress={() => setShowLogitBiasDialog(false)} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.modalDescription, { color: themeColors.secondaryText }]}>
              Influence how likely specific tokens are to appear. Format: [token_id, bias] per line. Example: "123, 0.5" to make token 123 more likely.
            </Text>

            <ScrollView style={styles.textAreaContainer}>
              <TextInput
                style={[styles.textArea, { 
                  color: themeColors.text,
                  backgroundColor: themeColors.borderColor + '20',
                  borderColor: themeColors.borderColor,
                }]}
                value={tempLogitBias}
                onChangeText={setTempLogitBias}
                placeholder="Enter token_id, bias pairs (one per line)&#10;Example:&#10;123, 0.5&#10;456, -1.0"
                placeholderTextColor={themeColors.secondaryText}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              {tempLogitBias !== '' && (
                <TouchableOpacity
                  style={[styles.resetButton, { backgroundColor: themeColors.primary + '20' }]}
                  onPress={() => setTempLogitBias('')}
                >
                  <MaterialCommunityIcons name="refresh" size={20} color={themeColors.primary} />
                  <Text style={[styles.resetText, { color: themeColors.primary }]}>Clear All</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: themeColors.primary }]}
                onPress={() => {
                  try {
                    const lines = tempLogitBias.split('\n').filter(line => line.trim());
                    const logitBias = lines.map(line => {
                      const [tokenId, bias] = line.split(',').map(s => parseFloat(s.trim()));
                      return [tokenId || 0, bias || 0];
                    }).filter(([tokenId, bias]) => !isNaN(tokenId) && !isNaN(bias));
                    onSettingsChange({ logitBias });
                    setShowLogitBiasDialog(false);
                  } catch (error) {
                    // Handle parsing error - could add error state here
                    onSettingsChange({ logitBias: [] });
                    setShowLogitBiasDialog(false);
                  }
                }}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DRY Sequence Breakers Dialog */}
      <Modal
        visible={showDrySequenceBreakersDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDrySequenceBreakersDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>DRY Sequence Breakers</Text>
              <TouchableOpacity onPress={() => setShowDrySequenceBreakersDialog(false)} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.modalDescription, { color: themeColors.secondaryText }]}>
              Enter symbols that reset the repetition checker in DRY mode. Each symbol should be on a new line.
            </Text>

            <ScrollView style={styles.textAreaContainer}>
              <TextInput
                style={[styles.textArea, { 
                  color: themeColors.text,
                  backgroundColor: themeColors.borderColor + '20',
                  borderColor: themeColors.borderColor,
                }]}
                value={tempDrySequenceBreakers}
                onChangeText={setTempDrySequenceBreakers}
                placeholder="Enter sequence breakers (one per line)&#10;Example:&#10;.&#10;!&#10;?"
                placeholderTextColor={themeColors.secondaryText}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              {(tempDrySequenceBreakers.split('\n').filter(s => s.trim()).length !== (defaultSettings.drySequenceBreakers || []).length ||
                !tempDrySequenceBreakers.split('\n').filter(s => s.trim()).every((item, index) => item === (defaultSettings.drySequenceBreakers || [])[index])) && (
                <TouchableOpacity
                  style={[styles.resetButton, { backgroundColor: themeColors.primary + '20' }]}
                  onPress={() => setTempDrySequenceBreakers((defaultSettings.drySequenceBreakers || []).join('\n'))}
                >
                  <MaterialCommunityIcons name="refresh" size={20} color={themeColors.primary} />
                  <Text style={[styles.resetText, { color: themeColors.primary }]}>Reset to Default</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: themeColors.primary }]}
                onPress={() => {
                  const drySequenceBreakers = tempDrySequenceBreakers
                    .split('\n')
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
                  onSettingsChange({ drySequenceBreakers });
                  setShowDrySequenceBreakersDialog(false);
                }}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  advancedTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'center',
  },
  advancedTagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: Dimensions.get('window').width - 48,
    maxHeight: Dimensions.get('window').height - 200,
    borderRadius: 16,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  modalDescription: {
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  textAreaContainer: {
    maxHeight: 200,
    marginBottom: 20,
  },
  textArea: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  numberInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalFooter: {
    gap: 12,
  },
  saveButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ModelSettingsSection; 