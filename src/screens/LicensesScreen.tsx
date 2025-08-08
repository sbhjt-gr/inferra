import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import AppHeader from '../components/AppHeader';

type LicensesScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'SettingsTab'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

interface License {
  name: string;
  description: string;
  licenseType: string;
  licenseUrl?: string;
  repositoryUrl?: string;
}

const licenses: License[] = [
    {
        name: 'Vector Icons',
        description: 'Perfect for buttons, logos and nav/tab bars',
        licenseType: 'MIT License',
        licenseUrl: 'https://github.com/expo/vector-icons/blob/main/LICENSE',
        repositoryUrl: 'https://github.com/expo/vector-icons'
    },
    {
      name: 'Firebase',
      description: 'Google Firebase SDK for React Native',
      licenseType: 'Apache License 2.0',
      licenseUrl: 'https://github.com/invertase/react-native-firebase/blob/main/LICENSE',
      repositoryUrl: 'https://github.com/invertase/react-native-firebase'
    },
  {
    name: 'React Native Paper',
    description: 'Material Design for React Native',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/callstack/react-native-paper/blob/main/LICENSE.md',
    repositoryUrl: 'https://github.com/callstack/react-native-paper'
  },
  {
    name: 'llama.rn',
    description: 'Llama.cpp inference engine binding for React Native',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/mybigday/llama.rn/blob/master/LICENSE',
    repositoryUrl: 'https://github.com/mybigday/llama.rn'
  },
  {
    name: 'React Native ML Kit Text Recognition',
    description: 'React Native ML Kit Text Recognition',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/a7medev/react-native-ml-kit/blob/main/LICENSE',
    repositoryUrl: 'https://github.com/a7medev/react-native-ml-kit'
  },
  {
    name: 'React Native Markdown Display',
    description: 'React Native component to render Markdown text',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/iamacup/react-native-markdown-display/blob/master/LICENSE',
    repositoryUrl: 'https://github.com/iamacup/react-native-markdown-display'
  }
];

const LicensesScreen = ({ navigation }: LicensesScreenProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('Failed to open URL:', error);
    }
  };

  const renderLicenseItem = (license: License, index: number) => (
    <View 
      key={index} 
      style={[
        styles.licenseItem, 
        { 
          backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#f8f8f8',
          borderBottomColor: themeColors.borderColor 
        }
      ]}
    >
      <View style={styles.licenseHeader}>
        <Text style={[styles.licenseName, { color: themeColors.text }]}>
          {license.name}
        </Text>
      </View>
      
      <Text style={[styles.licenseDescription, { color: themeColors.secondaryText }]}>
        {license.description}
      </Text>
      
      <View style={styles.licenseLinks}>
        <View style={[styles.licenseTypeContainer, { backgroundColor: themeColors.primary + '20' }]}>
          <Text style={[styles.licenseType, { color: themeColors.primary }]}>
            {license.licenseType}
          </Text>
        </View>
        
        <View style={styles.linkButtons}>
          {license.licenseUrl && (
            <TouchableOpacity
              style={[styles.linkButton, { backgroundColor: themeColors.borderColor }]}
              onPress={() => openUrl(license.licenseUrl!)}
            >
              <MaterialCommunityIcons name="file-document-outline" size={16} color={themeColors.text} />
              <Text style={[styles.linkButtonText, { color: themeColors.text }]}>License</Text>
            </TouchableOpacity>
          )}
          
          {license.repositoryUrl && (
            <TouchableOpacity
              style={[styles.linkButton, { backgroundColor: themeColors.borderColor }]}
              onPress={() => openUrl(license.repositoryUrl!)}
            >
              <MaterialCommunityIcons name="github" size={16} color={themeColors.text} />
              <Text style={[styles.linkButtonText, { color: themeColors.text }]}>Repository</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <AppHeader 
        title="Open Source Licenses" 
        leftComponent={
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={themeColors.headerText} />
          </TouchableOpacity>
        }
      />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >

        <View style={styles.licensesContainer}>
          {licenses.map((license, index) => renderLicenseItem(license, index))}
        </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  headerDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  licensesContainer: {
    gap: 16,
  },
  licenseItem: {
    borderRadius: 12,
    padding: 16,
    borderBottomWidth: 1,
  },
  licenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  licenseName: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  licenseVersion: {
    fontSize: 14,
    fontWeight: '500',
  },
  licenseDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  licenseLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  licenseTypeContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  licenseType: {
    fontSize: 12,
    fontWeight: '600',
  },
  linkButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  linkButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  footerSection: {
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.1)',
  },
  footerText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 18,
    fontStyle: 'italic',
  },
});

export default LicensesScreen;
