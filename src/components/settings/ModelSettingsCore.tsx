import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppSwitch } from '../../services/adapters/SwitchAdapter';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import { EngineId } from '../../managers/inference-manager';
import RuntimeSection from './Runtime';

export type GpuConfig = {
  label: string;
  description: string;
  enabled: boolean;
  supported: boolean;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  reason?: 'ios_version' | 'no_adreno' | 'missing_cpu_features' | 'unknown';
  experimental?: boolean;
};

type ModelSettingsCoreProps = {
  onOpenSystemPromptDialog?: () => void;
  systemPromptModified?: boolean;
  enableRemoteModels?: boolean;
  onToggleRemoteModels?: (enabled: boolean) => void;
  showAppleFoundationToggle?: boolean;
  appleFoundationEnabled?: boolean;
  onToggleAppleFoundation?: (enabled: boolean) => void;
  engineEnabled?: Record<EngineId, boolean>;
  onEngineToggle?: (engine: EngineId, enabled: boolean) => void;
  onDialogOpen: (config: any) => void;
};

const ModelSettingsCore = ({
  onOpenSystemPromptDialog,
  systemPromptModified,
  enableRemoteModels,
  onToggleRemoteModels,
  showAppleFoundationToggle,
  appleFoundationEnabled,
  onToggleAppleFoundation,
  engineEnabled,
  onEngineToggle,
}: ModelSettingsCoreProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;

  return (
    <>
      {onOpenSystemPromptDialog && (
        <TouchableOpacity 
          style={[styles.settingItem, styles.settingItemBottomBorder]}
          onPress={onOpenSystemPromptDialog}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
              <MaterialCommunityIcons name="message-text-outline" size={22} color={iconColor} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingText, { color: themeColors.text }]}>
                System Prompt
              </Text>
              <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                Define what should the AI know about you and your preferences
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.secondaryText} />
        </TouchableOpacity>
      )}

      {enableRemoteModels !== undefined && onToggleRemoteModels && (
        <View style={[styles.settingItem, styles.settingItemBottomBorder]}>
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
              <MaterialCommunityIcons 
                name="cloud-outline"
                size={22} 
                color={iconColor} 
              />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingText, { color: themeColors.text }]}>
                Enable Remote Models
              </Text>
              <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                Access cloud-based AI models (Gemini, ChatGPT, Claude)
              </Text>
            </View>
          </View>
          <AppSwitch
            value={enableRemoteModels}
            onValueChange={onToggleRemoteModels}
          />
        </View>
      )}

      {showAppleFoundationToggle && onToggleAppleFoundation && (
        <View style={[styles.settingItem, styles.settingItemBottomBorder]}> 
          <View style={styles.settingLeft}>
            <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
              <MaterialCommunityIcons
                name="apple"
                size={22}
                color={iconColor}
              />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingText, { color: themeColors.text }]}> 
                Enable Apple Foundation
              </Text>
              <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}> 
                Use Apple Intelligence models when available
              </Text>
            </View>
          </View>
          <AppSwitch
            value={Boolean(appleFoundationEnabled)}
            onValueChange={onToggleAppleFoundation}
          />
        </View>
      )}

      {engineEnabled && onEngineToggle && (
        <RuntimeSection
          enabled={engineEnabled}
          onToggle={onEngineToggle}
        />
      )}
    </>
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
  settingItemTopBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.1)',
  },
  settingItemBottomBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.1)',
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
});

export default ModelSettingsCore;
