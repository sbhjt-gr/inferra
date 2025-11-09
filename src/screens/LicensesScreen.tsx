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
    name: 'React',
    description: 'JavaScript library for building user interfaces',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/facebook/react/blob/main/LICENSE',
    repositoryUrl: 'https://github.com/facebook/react'
  },
  {
    name: 'React Native',
    description: 'Framework for building native apps using React',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/facebook/react-native/blob/main/LICENSE',
    repositoryUrl: 'https://github.com/facebook/react-native'
  },
  {
    name: 'Expo',
    description: 'Platform for making universal native apps',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/expo/expo/blob/main/LICENSE',
    repositoryUrl: 'https://github.com/expo/expo'
  },
  {
    name: 'Expo Vector Icons',
    description: 'Perfect for buttons, logos and nav/tab bars',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/expo/vector-icons/blob/main/LICENSE',
    repositoryUrl: 'https://github.com/expo/vector-icons'
  },
  {
    name: 'React Navigation',
    description: 'Routing and navigation for React Native apps',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/react-navigation/react-navigation/blob/main/packages/core/LICENSE',
    repositoryUrl: 'https://github.com/react-navigation/react-navigation'
  },
  {
    name: 'Firebase',
    description: 'Google Firebase SDK for JavaScript',
    licenseType: 'Apache License 2.0',
    licenseUrl: 'https://github.com/firebase/firebase-js-sdk/blob/master/LICENSE',
    repositoryUrl: 'https://github.com/firebase/firebase-js-sdk'
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
    name: 'React Native RAG',
    description: 'Retrieval-Augmented Generation for React Native',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/software-mansion-labs/react-native-rag/blob/main/LICENSE',
    repositoryUrl: 'https://github.com/software-mansion-labs/react-native-rag'
  },
  {
    name: 'React Native AI Apple',
    description: 'Apple Intelligence SDK for React Native',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/callstackincubator/ai/blob/main/LICENSE',
    repositoryUrl: 'https://github.com/callstackincubator/ai'
  },
  {
    name: 'React Native ML Kit Text Recognition',
    description: 'Google ML Kit text recognition for React Native',
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
  },
  {
    name: 'React Native Gesture Handler',
    description: 'Declarative API exposing platform native touch and gesture system',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/software-mansion/react-native-gesture-handler/blob/main/LICENSE',
    repositoryUrl: 'https://github.com/software-mansion/react-native-gesture-handler'
  },
  {
    name: 'React Native Screens',
    description: 'Native navigation primitives for React Native apps',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/software-mansion/react-native-screens/blob/main/LICENSE',
    repositoryUrl: 'https://github.com/software-mansion/react-native-screens'
  },
  {
    name: 'React Native Safe Area Context',
    description: 'Flexible way to handle safe area insets',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/th3rdwave/react-native-safe-area-context/blob/main/LICENSE',
    repositoryUrl: 'https://github.com/th3rdwave/react-native-safe-area-context'
  },
  {
    name: 'React Native SVG',
    description: 'SVG library for React Native',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/software-mansion/react-native-svg/blob/main/LICENSE',
    repositoryUrl: 'https://github.com/software-mansion/react-native-svg'
  },
  {
    name: 'React Native WebView',
    description: 'WebView component for React Native',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/react-native-webview/react-native-webview/blob/master/LICENSE',
    repositoryUrl: 'https://github.com/react-native-webview/react-native-webview'
  },
  {
    name: 'OP SQLite',
    description: 'Fast SQLite implementation for React Native',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/OP-Engineering/op-sqlite/blob/main/LICENSE',
    repositoryUrl: 'https://github.com/OP-Engineering/op-sqlite'
  },
  {
    name: 'React Native Async Storage',
    description: 'Asynchronous, persistent key-value storage system',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/react-native-async-storage/async-storage/blob/main/LICENSE',
    repositoryUrl: 'https://github.com/react-native-async-storage/async-storage'
  },
  {
    name: 'React Native FS',
    description: 'Native filesystem access for React Native',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/birdofpreyru/react-native-fs/blob/master/LICENSE',
    repositoryUrl: 'https://github.com/birdofpreyru/react-native-fs'
  },
  {
    name: 'React Native Google Sign In',
    description: 'Google Sign-In for React Native',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/react-native-google-signin/google-signin/blob/master/LICENSE',
    repositoryUrl: 'https://github.com/react-native-google-signin/google-signin'
  },
  {
    name: 'React Native In App Review',
    description: 'Native in-app review functionality',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/MinaSamir11/react-native-in-app-review/blob/master/LICENSE',
    repositoryUrl: 'https://github.com/MinaSamir11/react-native-in-app-review'
  },
  {
    name: 'React Native Community Slider',
    description: 'Slider component for React Native',
    licenseType: 'MIT License',
    licenseUrl: 'https://github.com/callstack/react-native-slider/blob/main/LICENSE.md',
    repositoryUrl: 'https://github.com/callstack/react-native-slider'
  },
  {
    name: 'TypeScript',
    description: 'Typed superset of JavaScript',
    licenseType: 'Apache License 2.0',
    licenseUrl: 'https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt',
    repositoryUrl: 'https://github.com/microsoft/TypeScript'
  }
];

const LicensesScreen = ({ navigation }: LicensesScreenProps) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
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
        rightButtons={[]}
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
