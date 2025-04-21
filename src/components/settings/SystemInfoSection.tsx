import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';
import SettingsSection from './SettingsSection';
import * as Device from 'expo-device';

type SystemInfo = {
  os: string;
  osVersion: string | null;
  device: string;
  deviceType: string | Device.DeviceType;
  appVersion: string;
  cpu: string;
  memory: string;
  gpu: string;
};

type SystemInfoSectionProps = {
  systemInfo: SystemInfo;
};

const SystemInfoSection = ({ systemInfo }: SystemInfoSectionProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;
  const [showSystemInfo, setShowSystemInfo] = useState(false);

  return (
    <SettingsSection title="SYSTEM INFO">
      <TouchableOpacity 
        style={[styles.settingItem]}
        onPress={() => setShowSystemInfo(!showSystemInfo)}
      >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
            <MaterialCommunityIcons name="information-outline" size={22} color={iconColor} />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingText, { color: themeColors.text }]}>
              Device Information
            </Text>
            <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
              Tap to {showSystemInfo ? 'hide' : 'view'} system details
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons 
          name={showSystemInfo ? "chevron-up" : "chevron-down"} 
          size={20} 
          color={themeColors.secondaryText} 
        />
      </TouchableOpacity>

      {showSystemInfo && (
        <>
          <View style={[styles.settingItem, styles.settingItemBorder]}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <MaterialCommunityIcons name="cellphone" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Platform
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  {systemInfo.os.charAt(0).toUpperCase() + systemInfo.os.slice(1)} {systemInfo.osVersion}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.settingItem, styles.settingItemBorder]}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <MaterialCommunityIcons name="chip" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  CPU
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  {systemInfo.cpu}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.settingItem, styles.settingItemBorder]}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <MaterialCommunityIcons name="content-save-outline" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Memory
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  {systemInfo.memory}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.settingItem, styles.settingItemBorder]}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <MaterialCommunityIcons name="cellphone" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Device
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  {systemInfo.device} ({systemInfo.deviceType})
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.settingItem, styles.settingItemBorder]}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <MaterialCommunityIcons name="apps" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  App Version
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  {systemInfo.appVersion}
                </Text>
              </View>
            </View>
          </View>
        </>
      )}
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

export default SystemInfoSection; 