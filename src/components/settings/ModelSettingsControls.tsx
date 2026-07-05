import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppSwitch } from '../../services/adapters/SwitchAdapter';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';

type ModelSettings = {
  stopWords: string[];
  jinja: boolean;
  grammar: string;
  enableThinking: boolean;
};

type ModelSettingsControlsProps = {
  modelSettings: ModelSettings;
  defaultSettings: Partial<ModelSettings>;
  onSettingsChange: (settings: Partial<ModelSettings>) => void;
  onStopWordsPress: () => void;
  onGrammarDialogOpen: () => void;
  showMlxWarning?: boolean;
  visibility?: {
    showStopWords?: boolean;
    showJinja?: boolean;
    showGrammar?: boolean;
    showEnableThinking?: boolean;
  };
};

const isArrayDifferent = (current: any[] | undefined, defaultValue: any[] | undefined): boolean => {
  const currArray = current || [];
  const defArray = defaultValue || [];
  return currArray.length !== defArray.length || 
         !currArray.every((item, index) => item === defArray[index]);
};

const ModelSettingsControls = ({
  modelSettings,
  defaultSettings,
  onSettingsChange,
  onStopWordsPress,
  onGrammarDialogOpen,
  showMlxWarning,
  visibility,
}: ModelSettingsControlsProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;
  const showStopWords = visibility?.showStopWords ?? true;
  const showJinja = visibility?.showJinja ?? true;
  const showGrammar = visibility?.showGrammar ?? true;
  const showEnableThinking = visibility?.showEnableThinking ?? true;
  const showGenerationControl = showStopWords;
  const showCoreSettings = showJinja || showGrammar || showEnableThinking;

  return (
    <>
      {showGenerationControl ? (
        <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}> 
          <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>GENERATION CONTROL</Text>
        </View>
      ) : null}

      {showStopWords ? (
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
      ) : null}

      {showCoreSettings ? (
        <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}> 
          <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>CORE SETTINGS</Text>
        </View>
      ) : null}

      {showJinja ? (
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
              {showMlxWarning && (
                <Text style={styles.unsupportedText}>Unsupported on MLX</Text>
              )}
            </View>
          </View>
          <AppSwitch
            value={modelSettings.jinja}
            onValueChange={(value) => onSettingsChange({ jinja: value })}
          />
        </View>
      ) : null}

      {showGrammar ? (
        <TouchableOpacity 
          style={[styles.settingItem, styles.settingItemBorder]}
          onPress={onGrammarDialogOpen}
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
              {showMlxWarning && (
                <Text style={styles.unsupportedText}>Unsupported on MLX</Text>
              )}
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.secondaryText} />
        </TouchableOpacity>
      ) : null}

      {showEnableThinking ? (
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
            </View>
          </View>
          <AppSwitch
            value={modelSettings.enableThinking}
            onValueChange={(value) => onSettingsChange({ enableThinking: value })}
          />
        </View>
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
  unsupportedText: {
    fontSize: 11,
    color: '#FF9500',
    fontWeight: '500',
    marginTop: 4,
  },
});

export default ModelSettingsControls;
