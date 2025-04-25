import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Platform, ScrollView, Linking } from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList } from '../types/navigation';
import { useTheme } from '../context/ThemeContext';
import { useRemoteModel } from '../context/RemoteModelContext';
import { theme } from '../constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppHeader from '../components/AppHeader';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { llamaManager } from '../utils/LlamaManager';
import ModelSettingDialog from '../components/ModelSettingDialog';
import StopWordsDialog from '../components/StopWordsDialog';
import SystemPromptDialog from '../components/SystemPromptDialog';
import * as FileSystem from 'expo-file-system';
import { useFocusEffect } from '@react-navigation/native';
import { modelDownloader } from '../services/ModelDownloader';
import ChatSettingsSection from '../components/settings/ChatSettingsSection';
import AppearanceSection from '../components/settings/AppearanceSection';
import SupportSection from '../components/settings/SupportSection';
import ModelSettingsSection from '../components/settings/ModelSettingsSection';
import SystemInfoSection from '../components/settings/SystemInfoSection';
import StorageSection from '../components/settings/StorageSection';
import { Dialog, Portal, PaperProvider, Button, Text as PaperText } from 'react-native-paper';

type SettingsScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'SettingsTab'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

type ThemeOption = 'system' | 'light' | 'dark';

const DEFAULT_SETTINGS = {
  maxTokens: 1200,
  temperature: 0.7,
  topK: 40,
  topP: 0.9,
  minP: 0.05,
  stopWords: ['<|end|>', '<end_of_turn>', '<|im_end|>', '<|endoftext|>'],
  systemPrompt: 'You are an AI assistant.'
};

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { theme: currentTheme, selectedTheme, toggleTheme } = useTheme();
  const { enableRemoteModels, toggleRemoteModels, isLoggedIn } = useRemoteModel();
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

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogActions, setDialogActions] = useState<React.ReactNode[]>([]);

  const hideDialog = () => setDialogVisible(false);

  const showDialog = (title: string, message: string, actions: React.ReactNode[]) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogActions(actions);
    setDialogVisible(true);
  };

  useFocusEffect(
    React.useCallback(() => {
      setModelSettings(llamaManager.getSettings());
      loadStorageInfo();
    }, [])
  );

  useEffect(() => {
    const getSystemInfo = async () => {
      try {
        const memory = Device.totalMemory;
        const memoryGB = memory ? (memory / (1024 * 1024 * 1024)).toFixed(1) : 'Unknown';
        
        const cpuCores = Device.supportedCpuArchitectures?.join(', ') || 'Unknown';
        
        setSystemInfo(prev => ({
          os: Platform.OS,
          osVersion: Device.osVersion || Platform.Version.toString(),
          device: Device.modelName || 'Unknown',
          deviceType: Device.deviceType || 'Unknown',
          appVersion: Constants.expoConfig?.version || 'Unknown',
          cpu: cpuCores,
          memory: `${memoryGB} GB`,
          gpu: Device.modelName || 'Unknown'
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
      showDialog('Error', 'Failed to save settings', [
        <Button key="ok" onPress={hideDialog}>OK</Button>
      ]);
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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

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

  const clearCache = async () => {
    try {
      setIsClearing(true);
      if (FileSystem.cacheDirectory) {
        await clearDirectory(FileSystem.cacheDirectory);
      }
      await loadStorageInfo();
      showDialog('Success', 'Cache cleared successfully', [
        <Button key="ok" onPress={hideDialog}>OK</Button>
      ]);
    } catch (error) {
      showDialog('Error', 'Failed to clear cache', [
        <Button key="ok" onPress={hideDialog}>OK</Button>
      ]);
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
      showDialog('Success', 'Temporary files cleared successfully', [
        <Button key="ok" onPress={hideDialog}>OK</Button>
      ]);
    } catch (error) {
      showDialog('Error', 'Failed to clear temporary files', [
        <Button key="ok" onPress={hideDialog}>OK</Button>
      ]);
    } finally {
      setIsClearing(false);
    }
  };

  const clearAllModels = async () => {
    try {
      showDialog(
        'Clear All Models',
        'Are you sure you want to delete all models? This action cannot be undone.',
        [
          <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
          <Button
            key="delete"
            onPress={async () => {
              hideDialog();
              try {
                setIsClearing(true);
                const modelsDir = `${FileSystem.documentDirectory}models`;
                await clearDirectory(modelsDir);
                await modelDownloader.refreshStoredModels();
                await loadStorageInfo();
                showDialog('Success', 'All models cleared successfully', [
                  <Button key="ok" onPress={hideDialog}>OK</Button>
                ]);
              } catch (error) {
                showDialog('Error', 'Failed to clear models', [
                  <Button key="ok" onPress={hideDialog}>OK</Button>
                ]);
              } finally {
                setIsClearing(false);
              }
            }}
          >
            Delete
          </Button>
        ]
      );
    } catch (error) {
      showDialog('Error', 'Failed to clear models', [
        <Button key="ok" onPress={hideDialog}>OK</Button>
      ]);
    }
  };

  const handleRemoteModelsToggle = async () => {
    if (!isLoggedIn && !enableRemoteModels) {
      showDialog(
        'Authentication Required',
        'You need to sign in to enable remote models.',
        [
          <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
          <Button 
            key="signup" 
            onPress={() => {
              hideDialog();
              navigation.navigate('Register', {
                redirectTo: 'MainTabs',
                redirectParams: { screen: 'SettingsTab' }
              });
            }}
          >
            Sign Up
          </Button>,
          <Button 
            key="login" 
            onPress={() => {
              hideDialog();
              navigation.navigate('Login', {
                redirectTo: 'MainTabs',
                redirectParams: { screen: 'SettingsTab' }
              });
            }}
          >
            Sign In
          </Button>
        ]
      );
      return;
    }
    
    const result = await toggleRemoteModels();
    if (!result.success && result.requiresLogin) {
      navigation.navigate('Login', {
        redirectTo: 'MainTabs',
        redirectParams: { screen: 'SettingsTab' }
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme[currentTheme].background }]}>
      <AppHeader 
        title="Settings"
      />
      <ScrollView contentContainerStyle={styles.contentContainer}>
        
        <ChatSettingsSection
          modelSettings={modelSettings}
          defaultSettings={DEFAULT_SETTINGS}
          onOpenSystemPromptDialog={() => setShowSystemPromptDialog(true)}
          onResetSystemPrompt={() => handleSettingsChange({ systemPrompt: DEFAULT_SETTINGS.systemPrompt })}
        />

        <AppearanceSection
          selectedTheme={selectedTheme}
          onThemeChange={handleThemeChange}
        />

        <SupportSection onOpenLink={openLink} />

        <ModelSettingsSection
          modelSettings={modelSettings}
          defaultSettings={DEFAULT_SETTINGS}
          error={error}
          onSettingsChange={handleSettingsChange}
          onMaxTokensPress={handleMaxTokensPress}
          onStopWordsPress={() => setShowStopWordsDialog(true)}
          onDialogOpen={handleOpenDialog}
          enableRemoteModels={enableRemoteModels}
          onToggleRemoteModels={handleRemoteModelsToggle}
        />

        <SystemInfoSection systemInfo={systemInfo} />

        <StorageSection
          storageInfo={storageInfo}
          isClearing={isClearing}
          onClearCache={clearCache}
          onClearTempFiles={clearTempFiles}
          onClearAllModels={clearAllModels}
        />

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

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={hideDialog}>
          <Dialog.Title>{dialogTitle}</Dialog.Title>
          <Dialog.Content>
            <PaperText>{dialogMessage}</PaperText> 
          </Dialog.Content>
          <Dialog.Actions>
            {dialogActions.map((ActionComponent, index) =>
              React.isValidElement(ActionComponent) ? React.cloneElement(ActionComponent, { key: index }) : null
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
}); 