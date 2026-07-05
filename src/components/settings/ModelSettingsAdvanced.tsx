import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppSwitch } from '../../services/adapters/SwitchAdapter';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';

type ModelSettings = {
  nProbs: number;
  seed: number;
  ignoreEos: boolean;
  logitBias: Array<Array<number>>;
};

type ModelSettingsAdvancedProps = {
  modelSettings: ModelSettings;
  defaultSettings: Partial<ModelSettings>;
  onSettingsChange: (settings: Partial<ModelSettings>) => void;
  onNProbsDialogOpen: () => void;
  onSeedDialogOpen: () => void;
  onLogitBiasDialogOpen: () => void;
  showMlxWarning?: boolean;
};

const ModelSettingsAdvanced = ({
  modelSettings,
  defaultSettings,
  onSettingsChange,
  onNProbsDialogOpen,
  onSeedDialogOpen,
  onLogitBiasDialogOpen,
  showMlxWarning,
}: ModelSettingsAdvancedProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;

  return (
    <>
      <View style={[styles.sectionHeader, { borderTopColor: 'rgba(150, 150, 150, 0.1)' }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>EXPERT SETTINGS</Text>
      </View>

      <TouchableOpacity 
        style={[styles.settingItem, styles.settingItemBorder]}
        onPress={onNProbsDialogOpen}
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
            {showMlxWarning && (
              <Text style={styles.unsupportedText}>Unsupported on MLX</Text>
            )}
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
        onPress={onSeedDialogOpen}
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
            {showMlxWarning && (
              <Text style={styles.unsupportedText}>Unsupported on MLX</Text>
            )}
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
          </View>
        </View>
        <AppSwitch
          value={modelSettings.ignoreEos}
          onValueChange={(value) => onSettingsChange({ ignoreEos: value })}
        />
      </View>

      <TouchableOpacity 
        style={[styles.settingItem, styles.settingItemBorder]}
        onPress={onLogitBiasDialogOpen}
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
            {showMlxWarning && (
              <Text style={styles.unsupportedText}>Unsupported on MLX</Text>
            )}
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.secondaryText} />
      </TouchableOpacity>
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

export default ModelSettingsAdvanced;
