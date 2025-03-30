import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Switch, Platform, ScrollView, TouchableOpacity, Linking, TextInput, Alert, ActivityIndicator } from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppHeader from '../components/AppHeader';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { llamaManager } from '../utils/LlamaManager';
import SettingSlider from '../components/SettingSlider';
import ModelSettingDialog from '../components/ModelSettingDialog';
import StopWordsDialog from '../components/StopWordsDialog';
import SystemPromptDialog from '../components/SystemPromptDialog';
import * as FileSystem from 'expo-file-system';
import { useFocusEffect } from '@react-navigation/native';
import { modelDownloader } from '../services/ModelDownloader';
import { getThemeAwareColor } from '../utils/ColorUtils';

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

const DEFAULT_SETTINGS = {
  maxTokens: 1200,
  temperature: 0.7,
  topK: 40,
  topP: 0.9,
  minP: 0.05,
  stopWords: ['<|end|>', '<end_of_turn>', '<|im_end|>', '<|endoftext|>', ''],
  systemPrompt: 'You are an AI assistant.'
};

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
  const iconColor = currentTheme === 'dark' ? '#FFFFFF' : themeColors.primary;
  const [showSystemInfo, setShowSystemInfo] = useState(false);
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [systemInfo, setSystemInfo] = useState({
    os: Platform.OS,
    osVersion: Device.osVersion,
    device: Device.modelName || 'Unknown',
    deviceType: Device.deviceType || 'Unknown',
    appVersion: Constants.expoConfig?.version || 'Unknown',
    cpu: 'Unknown',
    memory: 'Unknown',
    gpu: 'Unknown'
  });
  const [modelSettings, setModelSettings] = useState(llamaManager.getSettings());
  const [error, setError] = useState<string | null>(null);
  const [dialogConfig, setDialogConfig] = useState<{
    visible: boolean;
    setting?: {
      key: keyof typeof modelSettings;
      label: string;
      value: number;
      minimumValue: number;
      maximumValue: number;
      step: number;
      description: string;
    };
  }>({
    visible: false
  });
  const [showStopWordsDialog, setShowStopWordsDialog] = useState(false);
  const [showSystemPromptDialog, setShowSystemPromptDialog] = useState(false);
  const [storageInfo, setStorageInfo] = useState({
    tempSize: '0 B',
    modelsSize: '0 B',
    cacheSize: '0 B'
  });
  const [isClearing, setIsClearing] = useState(false);

  // Load settings when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      setModelSettings(llamaManager.getSettings());
    }, [])
  );

  useEffect(() => {
    const getSystemInfo = async () => {
      try {
        const memory = Device.totalMemory;
        const memoryGB = memory ? (memory / (1024 * 1024 * 1024)).toFixed(1) : 'Unknown';
        
        // Get CPU cores
        const cpuCores = Device.supportedCpuArchitectures?.join(', ') || 'Unknown';
        
        setSystemInfo(prev => ({
          os: Platform.OS,
          osVersion: Device.osVersion || Platform.Version.toString(),
          device: Device.modelName || 'Unknown',
          deviceType: Device.deviceType || 'Unknown',
          appVersion: Constants.expoConfig?.version || 'Unknown',
          cpu: cpuCores,
          memory: `${memoryGB} GB`,
          gpu: Device.modelName || 'Unknown' // Best approximation for GPU in mobile devices
        }));
      } catch (error) {
        console.error('Error getting system info:', error);
      }
    };

    getSystemInfo();
  }, []);

  const handleThemeChange = async (newTheme: ThemeOption) => {
    try {
      await AsyncStorage.setItem('@theme_preference', newTheme);
      toggleTheme(newTheme);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const handleSettingsChange = async (newSettings: Partial<typeof modelSettings>) => {
    try {
      const updatedSettings = { ...modelSettings, ...newSettings };
      if ('maxTokens' in newSettings) {
        const tokens = updatedSettings.maxTokens;
        if (tokens < 1 || tokens > 4096) {
          setError('Max tokens must be between 1 and 4096');
          return;
        }
      }
      setError(null);
      setModelSettings(updatedSettings);
      await llamaManager.updateSettings(updatedSettings);
    } catch (error) {
      console.error('Error updating settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const handleSettingsReset = async () => {
    try {
      await llamaManager.resetSettings();
      setModelSettings(llamaManager.getSettings());
      setError(null);
    } catch (error) {
      console.error('Error resetting settings:', error);
      Alert.alert('Error', 'Failed to reset settings');
    }
  };

  const updateMaxTokens = (value: string) => {
    const tokens = parseInt(value, 10);
    if (!isNaN(tokens)) {
      handleSettingsChange({ maxTokens: tokens });
    }
  };

  const openLink = (url: string) => {
    Linking.openURL(url);
  };

  const handleOpenDialog = (config: typeof dialogConfig.setting) => {
    setDialogConfig({
      visible: true,
      setting: config
    });
  };

  const handleCloseDialog = () => {
    setDialogConfig({ visible: false });
  };

  const handleMaxTokensPress = () => {
    handleOpenDialog({
      key: 'maxTokens',
      label: 'Max Response Tokens',
      value: modelSettings.maxTokens,
      minimumValue: 1,
      maximumValue: 4096,
      step: 1,
      description: "Maximum number of tokens in model responses. More tokens = longer responses but slower generation."
    });
  };

  const ThemeOption = ({ title, description, value, icon }: {
    title: string;
    description: string;
    value: ThemeOption;
    icon: keyof typeof Ionicons.glyphMap;
  }) => (
    <TouchableOpacity 
      style={[
        styles.settingItem,
        value !== 'system' && styles.settingItemBorder
      ]}
      onPress={() => handleThemeChange(value)}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
          <Ionicons name={icon} size={22} color={iconColor} />
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

  // Add function to format bytes to human-readable format
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Add function to get directory size
  const getDirectorySize = async (directory: string): Promise<number> => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(directory);
      if (!dirInfo.exists) return 0;

      const files = await FileSystem.readDirectoryAsync(directory);
      let totalSize = 0;

      for (const file of files) {
        const filePath = `${directory}/${file}`;
        const fileInfo = await FileSystem.getInfoAsync(filePath, { size: true });
        if (fileInfo.exists) {
          totalSize += (fileInfo as any).size || 0;
        }
      }

      return totalSize;
    } catch (error) {
      console.error(`Error getting size of ${directory}:`, error);
      return 0;
    }
  };

  // Add function to load storage information
  const loadStorageInfo = async () => {
    try {
      const tempDir = `${FileSystem.documentDirectory}temp`;
      const modelsDir = `${FileSystem.documentDirectory}models`;
      const cacheDir = FileSystem.cacheDirectory || '';

      const tempSize = await getDirectorySize(tempDir);
      const modelsSize = await getDirectorySize(modelsDir);
      const cacheSize = await getDirectorySize(cacheDir);

      setStorageInfo({
        tempSize: formatBytes(tempSize),
        modelsSize: formatBytes(modelsSize),
        cacheSize: formatBytes(cacheSize)
      });
    } catch (error) {
      console.error('Error loading storage info:', error);
    }
  };

  // Add function to clear a directory
  const clearDirectory = async (directory: string): Promise<void> => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(directory);
      if (!dirInfo.exists) return;

      const files = await FileSystem.readDirectoryAsync(directory);
      
      for (const file of files) {
        const filePath = `${directory}/${file}`;
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }
    } catch (error) {
      console.error(`Error clearing directory ${directory}:`, error);
      throw error;
    }
  };

  // Add functions to clear specific directories
  const clearCache = async () => {
    try {
      setIsClearing(true);
      if (FileSystem.cacheDirectory) {
        await clearDirectory(FileSystem.cacheDirectory);
      }
      await loadStorageInfo();
      Alert.alert('Success', 'Cache cleared successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to clear cache');
    } finally {
      setIsClearing(false);
    }
  };

  const clearTempFiles = async () => {
    try {
      setIsClearing(true);
      const tempDir = `${FileSystem.documentDirectory}temp`;
      await clearDirectory(tempDir);
      await loadStorageInfo();
      Alert.alert('Success', 'Temporary files cleared successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to clear temporary files');
    } finally {
      setIsClearing(false);
    }
  };

  const clearAllModels = async () => {
    try {
      Alert.alert(
        'Clear All Models',
        'Are you sure you want to delete all models? This action cannot be undone.',
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                setIsClearing(true);
                const modelsDir = `${FileSystem.documentDirectory}models`;
                await clearDirectory(modelsDir);
                
                // Also clear external models references
                await modelDownloader.refreshStoredModels();
                
                await loadStorageInfo();
                Alert.alert('Success', 'All models cleared successfully');
              } catch (error) {
                Alert.alert('Error', 'Failed to clear models');
              } finally {
                setIsClearing(false);
              }
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to clear models');
    }
  };

  // Load storage info when the screen is focused
  useFocusEffect(
    React.useCallback(() => {
      loadStorageInfo();
      return () => {};
    }, [])
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.contentContainer}>
        
        <SettingsSection title="CHAT SETTINGS">
          <TouchableOpacity 
            style={[styles.settingItem]}
            onPress={() => setShowSystemPromptDialog(true)}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  System Prompt
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  Define what should the AI know about you and your preferences
                </Text>
                {modelSettings.systemPrompt !== DEFAULT_SETTINGS.systemPrompt && (
                  <TouchableOpacity
                    onPress={() => handleSettingsChange({ systemPrompt: DEFAULT_SETTINGS.systemPrompt })}
                    style={[styles.resetButton, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}
                  >
                    <Ionicons name="refresh-outline" size={14} color={iconColor} />
                    <Text style={[styles.resetText, { color: iconColor }]}>Reset to Default</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
          </TouchableOpacity>
        </SettingsSection>

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
            style={[styles.settingItem]}
            onPress={() => openLink('https://play.google.com/store/apps/details?id=com.gorai.ragionare')}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <Ionicons name="logo-google-playstore" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Liked My App?
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  Please rate my app 5 stars
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.settingItem, styles.settingItemBorder]}
            onPress={() => openLink('https://ko-fi.com/subhajitgorai')}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <Ionicons name="cafe-outline" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Support Development
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  Buy me a coffee on Ko-fi by donating
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.settingItem, styles.settingItemBorder]}
            onPress={() => openLink('https://github.com/ggerganov/llama.cpp')}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <Ionicons name="logo-github" size={22} color={iconColor} />
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
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <Ionicons name="shield-checkmark-outline" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Privacy Policy
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  View the app's privacy policy page
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
          </TouchableOpacity>
        </SettingsSection>

        <SettingsSection title="MODEL SETTINGS">
        <TouchableOpacity 
            style={[styles.settingItem, styles.settingItemBorder]}
            onPress={handleMaxTokensPress}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <Ionicons name="text-outline" size={22} color={iconColor} />
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
                {modelSettings.maxTokens !== DEFAULT_SETTINGS.maxTokens && (
                  <TouchableOpacity
                    onPress={() => handleSettingsChange({ maxTokens: DEFAULT_SETTINGS.maxTokens })}
                    style={[styles.resetButton, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}
                  >
                    <Ionicons name="refresh-outline" size={14} color={iconColor} />
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
            <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.settingItem, styles.settingItemBorder]}
            onPress={() => setShowStopWordsDialog(true)}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <Ionicons name="stop-circle-outline" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <View style={styles.labelRow}>
                  <Text style={[styles.settingText, { color: themeColors.text }]}>
                    Stop Words
                  </Text>
                  <Text style={[styles.valueText, { color: themeColors.text }]}>
                    {modelSettings.stopWords.length}
                  </Text>
                </View>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  Words that will cause the model to stop generating. One word per line.
                </Text>
                {JSON.stringify(modelSettings.stopWords) !== JSON.stringify(DEFAULT_SETTINGS.stopWords) && (
                  <TouchableOpacity
                    onPress={() => handleSettingsChange({ stopWords: DEFAULT_SETTINGS.stopWords })}
                    style={[styles.resetButton, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}
                  >
                    <Ionicons name="refresh-outline" size={14} color={iconColor} />
                    <Text style={[styles.resetText, { color: iconColor }]}>Reset to Default</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
          </TouchableOpacity>

          <SettingSlider
            label="Temperature"
            value={modelSettings.temperature}
            defaultValue={DEFAULT_SETTINGS.temperature}
            onValueChange={(value) => handleSettingsChange({ temperature: value })}
            minimumValue={0}
            maximumValue={2}
            step={0.01}
            description="Controls randomness in responses. Higher values make the output more creative but less focused."
            onPressChange={() => handleOpenDialog({
              key: 'temperature',
              label: 'Temperature',
              value: modelSettings.temperature,
              minimumValue: 0,
              maximumValue: 2,
              step: 0.01,
              description: "Controls randomness in responses. Higher values make the output more creative but less focused."
            })}
          />

          <SettingSlider
            label="Top K"
            value={modelSettings.topK}
            defaultValue={DEFAULT_SETTINGS.topK}
            onValueChange={(value) => handleSettingsChange({ topK: value })}
            minimumValue={1}
            maximumValue={100}
            step={1}
            description="Limits the cumulative probability of tokens considered for each step of text generation."
            onPressChange={() => handleOpenDialog({
              key: 'topK',
              label: 'Top K',
              value: modelSettings.topK,
              minimumValue: 1,
              maximumValue: 100,
              step: 1,
              description: "Limits the cumulative probability of tokens considered for each step of text generation."
            })}
          />

          <SettingSlider
            label="Top P"
            value={modelSettings.topP}
            defaultValue={DEFAULT_SETTINGS.topP}
            onValueChange={(value) => handleSettingsChange({ topP: value })}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            description="Controls diversity of responses. Higher values = more diverse but potentially less focused."
            onPressChange={() => handleOpenDialog({
              key: 'topP',
              label: 'Top P',
              value: modelSettings.topP,
              minimumValue: 0,
              maximumValue: 1,
              step: 0.01,
              description: "Controls diversity of responses. Higher values = more diverse but potentially less focused."
            })}
          />

          <SettingSlider
            label="Min P"
            value={modelSettings.minP}
            defaultValue={DEFAULT_SETTINGS.minP}
            onValueChange={(value) => handleSettingsChange({ minP: value })}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            description="Minimum probability threshold. Higher values = more focused on likely tokens."
            onPressChange={() => handleOpenDialog({
              key: 'minP',
              label: 'Min P',
              value: modelSettings.minP,
              minimumValue: 0,
              maximumValue: 1,
              step: 0.01,
              description: "Minimum probability threshold. Higher values = more focused on likely tokens."
            })}
          />

          
        </SettingsSection>


        <SettingsSection title="SYSTEM INFO">
          <TouchableOpacity 
            style={[styles.settingItem]}
            onPress={() => setShowSystemInfo(!showSystemInfo)}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <Ionicons name="information-circle-outline" size={22} color={iconColor} />
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
            <Ionicons 
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
                    <Ionicons name="phone-portrait-outline" size={22} color={iconColor} />
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
                    <Ionicons name="hardware-chip-outline" size={22} color={iconColor} />
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
                    <Ionicons name="save-outline" size={22} color={iconColor} />
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
                    <Ionicons name="phone-portrait-outline" size={22} color={iconColor} />
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
                    <Ionicons name="apps-outline" size={22} color={iconColor} />
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

        <SettingsSection title="STORAGE">
          <TouchableOpacity 
            style={styles.settingItem}
            onPress={clearCache}
            disabled={isClearing}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <Ionicons name="trash-outline" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Clear Cache
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  {storageInfo.cacheSize} of cached data
                </Text>
              </View>
            </View>
            {isClearing ? (
              <ActivityIndicator size="small" color={themeColors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.settingItem, styles.settingItemBorder]}
            onPress={clearTempFiles}
            disabled={isClearing}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : themeColors.primary + '20' }]}>
                <Ionicons name="folder-outline" size={22} color={iconColor} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Clear Temporary Files
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  {storageInfo.tempSize} of temporary data
                </Text>
              </View>
            </View>
            {isClearing ? (
              <ActivityIndicator size="small" color={themeColors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.settingItem, styles.settingItemBorder]}
            onPress={clearAllModels}
            disabled={isClearing}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#FF3B3020' }]}>
                <Ionicons name="alert-circle-outline" size={22} color={getThemeAwareColor('#FF3B30', currentTheme)} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: themeColors.text }]}>
                  Clear All Models
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.secondaryText }]}>
                  {storageInfo.modelsSize} of model data will be permanently deleted
                </Text>
              </View>
            </View>
            {isClearing ? (
              <ActivityIndicator size="small" color={getThemeAwareColor('#FF3B30', currentTheme)} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={themeColors.secondaryText} />
            )}
          </TouchableOpacity>
        </SettingsSection>

        {dialogConfig.setting && (
          <ModelSettingDialog
            key={dialogConfig.setting.key}
            visible={dialogConfig.visible}
            onClose={handleCloseDialog}
            onSave={(value) => {
              handleSettingsChange({ [dialogConfig.setting!.key]: value });
              handleCloseDialog();
            }}
            defaultValue={DEFAULT_SETTINGS[dialogConfig.setting.key] as number}
            label={dialogConfig.setting.label}
            value={dialogConfig.setting.value}
            minimumValue={dialogConfig.setting.minimumValue}
            maximumValue={dialogConfig.setting.maximumValue}
            step={dialogConfig.setting.step}
            description={dialogConfig.setting.description}
          />
        )}

        <StopWordsDialog
          visible={showStopWordsDialog}
          onClose={() => setShowStopWordsDialog(false)}
          onSave={(stopWords) => {
            handleSettingsChange({ stopWords });
            setShowStopWordsDialog(false);
          }}
          value={modelSettings.stopWords}
          defaultValue={DEFAULT_SETTINGS.stopWords}
          description="Enter words that will cause the model to stop generating. Each word should be on a new line. The model will stop when it generates any of these words."
        />

        <SystemPromptDialog
          visible={showSystemPromptDialog}
          onClose={() => setShowSystemPromptDialog(false)}
          onSave={(systemPrompt) => {
            handleSettingsChange({ systemPrompt });
            setShowSystemPromptDialog(false);
          }}
          value={modelSettings.systemPrompt}
          defaultValue={DEFAULT_SETTINGS.systemPrompt}
          description="Define how the AI assistant should behave. This prompt sets the personality, capabilities, and limitations of the assistant."
        />
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
    paddingTop: 22
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
  tokenInput: {
    width: 60,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
  tokenExplanation: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  settingGroup: {
    marginBottom: 24,
    padding: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 8,
  },
  error: {
    fontSize: 12,
    marginTop: 8,
    color: '#FF3B30',
  },
  sliderContainer: {
    marginBottom: 24,
    padding: 16,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  sliderValue: {
    fontSize: 14,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderDescription: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
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
  modelSettingGroup: {
    marginBottom: 24,
    padding: 16,
  },
  modelSettingLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  modelSettingInput: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 8,
  },
  modelSettingDescription: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  modelSettingError: {
    fontSize: 12,
    marginTop: 8,
    color: '#FF3B30',
  },
  modelResetButton: {
    marginTop: 8,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  modelResetButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  modelSettingReset: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  modelSettingDefaultValue: {
    fontSize: 12,
  },
  modelSettingResetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  modelSettingResetText: {
    fontSize: 12,
    fontWeight: '500',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  settingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  settingMeta: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
    color: '#FF3B30',
  },
  valueText: {
    fontSize: 16,
    fontWeight: '500',
  },
  storageInfoContainer: {
    marginTop: 8,
  },
  storageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  storageLabel: {
    fontSize: 16,
    flex: 1,
  },
  storageValue: {
    fontSize: 14,
    marginRight: 16,
  },
  clearButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
}); 