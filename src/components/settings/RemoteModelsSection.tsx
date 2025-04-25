import React from 'react';
import { StyleSheet, Text, View, Switch } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import SettingsSection from './SettingsSection';

type RemoteModelsSectionProps = {
  enableRemoteModels: boolean;
  onToggleRemoteModels: () => void;
};

const RemoteModelsSection = ({
  enableRemoteModels,
  onToggleRemoteModels
}: RemoteModelsSectionProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;

  return (
    <SettingsSection title="REMOTE MODELS">
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
});

export default RemoteModelsSection; 