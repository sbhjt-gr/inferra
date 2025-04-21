import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import SettingsSection from './SettingsSection';

type ChatSettingsSectionProps = {
  modelSettings: {
    systemPrompt: string;
  };
  defaultSettings: {
    systemPrompt: string;
  };
  onOpenSystemPromptDialog: () => void;
  onResetSystemPrompt: () => void;
};

const ChatSettingsSection = ({
  modelSettings,
  defaultSettings,
  onOpenSystemPromptDialog,
  onResetSystemPrompt
}: ChatSettingsSectionProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;

  return (
    <SettingsSection title="CHAT SETTINGS">
      <TouchableOpacity 
        style={styles.settingItem}
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
            {modelSettings.systemPrompt !== defaultSettings.systemPrompt && (
              <TouchableOpacity
                onPress={onResetSystemPrompt}
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

export default ChatSettingsSection; 