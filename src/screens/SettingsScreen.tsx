import React from 'react';
import { StyleSheet, Text, View, Switch, Platform, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppHeader from '../components/AppHeader';

type SettingsScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Settings'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

type SettingsSectionProps = {
  title: string;
  children: React.ReactNode;
};

type ThemeOption = 'system' | 'light' | 'dark';

const SettingsSection = ({ title, children }: SettingsSectionProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: themeColors.secondaryText }]}>
        {title}
      </Text>
      <View style={[styles.sectionContent, { backgroundColor: themeColors.borderColor }]}>
        {children}
      </View>
    </View>
  );
};

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { theme: currentTheme, selectedTheme, toggleTheme } = useTheme();
  const themeColors = theme[currentTheme];

  const handleThemeChange = async (newTheme: ThemeOption) => {
    try {
      await AsyncStorage.setItem('@theme_preference', newTheme);
      toggleTheme(newTheme);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const openLink = (url: string) => {
    Linking.openURL(url);
  };

  const ThemeOption = ({ title, description, value, icon }: {
    title: string;
    description: string;
    value: ThemeOption;
    icon: string;
  }) => (
    <TouchableOpacity 
      style={[
        styles.settingItem,
        value !== 'system' && styles.settingItemBorder
      ]}
      onPress={() => handleThemeChange(value)}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.iconContainer, { backgroundColor: themeColors.primary + '20' }]}>
          <Ionicons name={icon} size={22} color={themeColors.primary} />
        </View>
        <View style={styles.settingTextContainer}>
          <Text style={[styles.settingText, { color: themeColors.text }]}>
            {title}
          </Text>
          <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
            {description}
          </Text>
        </View>
      </View>
      <View style={[
        styles.radioButton,
        { borderColor: themeColors.primary },
        selectedTheme === value && styles.radioButtonSelected,
        selectedTheme === value && { borderColor: themeColors.primary, backgroundColor: themeColors.primary }
      ]}>
        {selectedTheme === value && (
          <View style={[styles.radioButtonInner, { backgroundColor: '#fff' }]} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <View style={styles.appInfo}>
            <Text style={[styles.appName, { color: themeColors.text }]}>Ragionare</Text>
            <Text style={[styles.appVersion, { color: themeColors.secondaryText }]}>Version 1.0.0</Text>
          </View>
        </View>

        <SettingsSection title="APPEARANCE">
          <ThemeOption
            title="System Default"
            description="Follow system theme settings"
            value="system"
            icon="phone-portrait-outline"
          />
          <ThemeOption
            title="Light Mode"
            description="Classic light appearance"
            value="light"
            icon="sunny-outline"
          />
          <ThemeOption
            title="Dark Mode"
            description="Easier on the eyes in low light"
            value="dark"
            icon="moon-outline"
          />
        </SettingsSection>

        <SettingsSection title="SUPPORT">
          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => openLink('https://github.com/ggerganov/llama.cpp')}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: themeColors.primary + '20' }]}>
                <Ionicons name="logo-github" size={22} color={themeColors.primary} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  GitHub Repository
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  Contribute to llama.cpp
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.settingItem, styles.settingItemBorder]}
            onPress={() => openLink('https://ragionare.ct.ws/privacy-policy')}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: themeColors.primary + '20' }]}>
                <Ionicons name="shield-checkmark-outline" size={22} color={themeColors.primary} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Privacy Policy
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  View our privacy policy
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
          </TouchableOpacity>
        </SettingsSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  header: {
    padding: 24,
    paddingTop: 12,
    alignItems: 'center',
  },
  appInfo: {
    alignItems: 'center',
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 15,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    borderRadius: 16,
    overflow: 'hidden',
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
  radioButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonSelected: {
    borderWidth: 0,
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
}); 