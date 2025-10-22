import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Platform, ScrollView, Linking, TouchableOpacity, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import AppearanceSection from '../components/settings/AppearanceSection';
import { getCurrentUser } from '../services/FirebaseService';
import SupportSection from '../components/settings/SupportSection';
import ModelSettingsSection, { type GpuConfig } from '../components/settings/ModelSettingsSection';
import SystemInfoSection from '../components/settings/SystemInfoSection';
import StorageSection from '../components/settings/StorageSection';
import { Dialog, Portal, PaperProvider, Button, Text as PaperText } from 'react-native-paper';
import { DEFAULT_SETTINGS } from '../config/llamaConfig';
import type { ModelSettings as StoredModelSettings } from '../services/ModelSettingsService';
import {
  gpuSettingsService,
  DEFAULT_GPU_LAYERS,
  GPU_LAYER_MIN,
  GPU_LAYER_MAX,
  type GpuSettings,
} from '../services/GpuSettingsService';
import { checkGpuSupport, type GpuSupport } from '../utils/gpuCapabilities';
import { appleFoundationService } from '../services/AppleFoundationService';

type SettingsScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'SettingsTab'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

type ThemeOption = 'system' | 'light' | 'dark';
type InferenceEngine = 'llama.cpp' | 'mediapipe' | 'mlc-llm' | 'mlx';

const DEFAULT_INFERENCE_ENGINE: InferenceEngine = 'llama.cpp';

type ModelSettingKey = keyof StoredModelSettings;

type DialogSettingConfig = {
  key?: ModelSettingKey;
  label: string;
  value: number;
  defaultValue?: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
  description: string;
  onSave?: (value: number) => Promise<void> | void;
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
  const [modelSettings, setModelSettings] = useState<StoredModelSettings>(
    llamaManager.getSettings()
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedInferenceEngine, setSelectedInferenceEngine] =
    useState<InferenceEngine>(DEFAULT_INFERENCE_ENGINE);
  
  const [dialogConfig, setDialogConfig] = useState<{
    visible: boolean;
    setting?: DialogSettingConfig;
  }>({
    visible: false,
  });
  const [showStopWordsDialog, setShowStopWordsDialog] = useState(false);
  const [showSystemPromptDialog, setShowSystemPromptDialog] = useState(false);
  const [storageInfo, setStorageInfo] = useState({
    tempSize: '0 B',
    modelsSize: '0 B',
    cacheSize: '0 B'
  });
  const [isClearing, setIsClearing] = useState(false);
  const [gpuSettings, setGpuSettings] = useState<GpuSettings>(
    gpuSettingsService.getSettingsSync()
  );
  const [gpuSupport, setGpuSupport] = useState<GpuSupport | null>(null);
  const isAppleDevice = Platform.OS === 'ios';
  const [appleFoundationEnabled, setAppleFoundationEnabled] = useState(false);
  const [appleFoundationSupported, setAppleFoundationSupported] = useState(false);
  const [showAppleFoundationDialog, setShowAppleFoundationDialog] = useState(false);

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

  const getDefaultValueForKey = (key?: ModelSettingKey): number | undefined => {
    if (!key) {
      return undefined;
    }

    const defaultsRecord = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
    const candidate = defaultsRecord[key as string];
    return typeof candidate === 'number' ? (candidate as number) : undefined;
  };

  useEffect(() => {
    let isActive = true;

    gpuSettingsService
      .loadSettings()
      .then(settings => {
        if (isActive) {
          setGpuSettings(settings);
        }
      })
      .catch(() => {
        // Ignore errors; defaults remain in place.
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    checkGpuSupport()
      .then(support => {
        if (isActive) {
          setGpuSupport(support);
        }
      })
      .catch(() => {
        if (isActive) {
          setGpuSupport({ isSupported: false, reason: 'unknown' });
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const initializeAppleFoundation = async () => {
      if (!isAppleDevice) {
        if (isActive) {
          setAppleFoundationEnabled(false);
          setAppleFoundationSupported(false);
        }
        return;
      }
      try {
        const available = appleFoundationService.isAvailable();
        const enabled = await appleFoundationService.isEnabled();
        if (isActive) {
          setAppleFoundationSupported(available);
          setAppleFoundationEnabled(enabled);
        }
      } catch (error) {
        if (isActive) {
          setAppleFoundationSupported(false);
          setAppleFoundationEnabled(false);
        }
      }
    };

    initializeAppleFoundation();

    return () => {
      isActive = false;
    };
  }, [isAppleDevice]);

  useEffect(() => {
    if (gpuSupport && !gpuSupport.isSupported && gpuSettings.enabled) {
      setGpuSettings(prev => ({ ...prev, enabled: false }));
      gpuSettingsService.setEnabled(false).catch(() => {});
    }
  }, [gpuSupport, gpuSettings.enabled]);

  useFocusEffect(
    React.useCallback(() => {
      setModelSettings(llamaManager.getSettings());
      loadStorageInfo();
      loadInferenceEnginePreference();
      gpuSettingsService
        .loadSettings()
        .then(setGpuSettings)
        .catch(() => {});
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
      }
    };

    getSystemInfo();
  }, []);

  const loadInferenceEnginePreference = async () => {
    try {
      const saved = await AsyncStorage.getItem('@inference_engine');
      if (saved) {
        setSelectedInferenceEngine(saved as InferenceEngine);
      }
    } catch (error) {
    }
  };

  const handleThemeChange = async (newTheme: ThemeOption) => {
    try {
      await AsyncStorage.setItem('@theme_preference', newTheme);
      toggleTheme(newTheme);
    } catch (error) {
    }
  };

  const handleInferenceEngineChange = async (engine: InferenceEngine) => {
    try {
      await AsyncStorage.setItem('@inference_engine', engine);
      setSelectedInferenceEngine(engine);
    } catch (error) {
      showDialog('Error', 'Failed to save inference engine preference', [
        <Button key="ok" onPress={hideDialog}>OK</Button>
      ]);
    }
  };

  const handleGpuToggle = async (enabled: boolean) => {
    const previous = gpuSettings.enabled;
    setGpuSettings(prev => ({ ...prev, enabled }));

    try {
      await gpuSettingsService.setEnabled(enabled);
    } catch (error) {
      setGpuSettings(prev => ({ ...prev, enabled: previous }));
      showDialog('Error', 'Failed to update GPU acceleration preference', [
        <Button key="ok" onPress={hideDialog}>OK</Button>,
      ]);
    }
  };

  const handleGpuLayersChange = async (layers: number) => {
    const previous = gpuSettings.layers;
    setGpuSettings(prev => ({ ...prev, layers }));

    try {
      await gpuSettingsService.setLayers(layers);
    } catch (error) {
      setGpuSettings(prev => ({ ...prev, layers: previous }));
      throw error;
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
      showDialog('Error', 'Failed to save settings', [
        <Button key="ok" onPress={hideDialog}>OK</Button>
      ]);
    }
  };

  const openLink = (url: string) => {
    Linking.openURL(url);
  };

  const handleOpenDialog = (config: DialogSettingConfig) => {
    const inferredDefault =
      config.defaultValue !== undefined
        ? config.defaultValue
        : getDefaultValueForKey(config.key);

    setDialogConfig({
      visible: true,
      setting: {
        ...config,
        defaultValue:
          typeof inferredDefault === 'number' ? inferredDefault : config.value,
      },
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
      defaultValue: DEFAULT_SETTINGS.maxTokens,
      minimumValue: 1,
      maximumValue: 4096,
      step: 1,
      description: "Maximum number of tokens in model responses. More tokens = longer responses but slower generation."
    });
  };

  const gpuConfig = React.useMemo<GpuConfig | undefined>(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return undefined;
    }

    const fallbackSupport: GpuSupport = Platform.OS === 'ios'
      ? { isSupported: true }
      : { isSupported: true, reason: 'unknown' };
    const support = gpuSupport ?? fallbackSupport;

    const label = Platform.OS === 'ios' ? 'Metal Acceleration' : 'OpenCL Acceleration';

    let description =
      Platform.OS === 'ios'
        ? 'Run transformer layers on the Apple Metal GPU to reduce CPU usage.'
        : 'Offload transformer layers to your device GPU via OpenCL.';

    if (!support.isSupported) {
      switch (support.reason) {
        case 'ios_version':
          description = 'Requires iOS 18 or newer to use Metal acceleration.';
          break;
        case 'no_adreno':
          description = 'Requires an Adreno GPU to enable OpenCL acceleration.';
          break;
        case 'missing_cpu_features':
          description = 'Requires CPU support for i8mm and dot product instructions.';
          break;
        default:
          description = 'GPU acceleration is not available on this device.';
      }
    } else if (support.reason === 'unknown' && Platform.OS === 'android') {
      description = 'Attempts to use OpenCL for faster inference. Capability check is inconclusive.';
    }

    const config: GpuConfig = {
      label,
      description,
      enabled: support.isSupported ? gpuSettings.enabled : false,
      supported: support.isSupported,
      value: gpuSettings.layers,
      defaultValue: DEFAULT_GPU_LAYERS,
      min: GPU_LAYER_MIN,
      max: GPU_LAYER_MAX,
      reason: support.reason,
      experimental: Platform.OS === 'android',
    };

    return config;
  }, [gpuSupport, gpuSettings.enabled, gpuSettings.layers]);

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
        'Inferra will require internet access and you need an account to enable remote models.',
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
    
    if (!enableRemoteModels) {
      const user = getCurrentUser();
      if (user && !user.emailVerified) {
        showDialog(
          'Email Verification Required',
          'You need to verify your email address before enabling remote models.',
          [
            <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
            <Button 
              key="profile" 
              onPress={() => {
                hideDialog();
                navigation.navigate('Profile');
              }}
            >
              Go to Profile
            </Button>
          ]
        );
        return;
      }
    }
    
    const result = await toggleRemoteModels();
    if (!result.success) {
      if (result.requiresLogin) {
        navigation.navigate('Login', {
          redirectTo: 'MainTabs',
          redirectParams: { screen: 'SettingsTab' }
        });
      } else if (result.emailNotVerified) {
        showDialog(
          'Email Verification Required',
          'You need to verify your email address before enabling remote models.',
          [
            <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
            <Button 
              key="profile" 
              onPress={() => {
                hideDialog();
                navigation.navigate('Profile');
              }}
            >
              Go to Profile
            </Button>
          ]
        );
      }
    }
  };

  const handleAppleFoundationToggle = async (value: boolean) => {
    if (!isAppleDevice) {
      return;
    }
    if (value) {
      const available = appleFoundationService.isAvailable();
      setAppleFoundationSupported(available);
      if (!available) {
        setShowAppleFoundationDialog(true);
        setAppleFoundationEnabled(false);
        await appleFoundationService.setEnabled(false);
        return;
      }
    }
    try {
      await appleFoundationService.setEnabled(value);
      setAppleFoundationEnabled(value);
    } catch (error) {
      const current = await appleFoundationService.isEnabled();
      setAppleFoundationEnabled(current);
    }
  };

  const ProfileButton = () => {
    return (
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => {
          if (isLoggedIn) {
            navigation.navigate('Profile');
          } else {
            navigation.navigate('Login', {
              redirectTo: 'MainTabs',
              redirectParams: { screen: 'SettingsTab' }
            });
          }
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MaterialCommunityIcons 
          name={isLoggedIn ? "account-circle" : "login"}
          size={22} 
          color={theme[currentTheme].headerText} 
        />
      </TouchableOpacity>
    );
  };

  return (
      <View style={[styles.container, { backgroundColor: theme[currentTheme].background }]}>
      <AppHeader 
        title="Settings"
        rightButtons={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ProfileButton />
          </View>
        } 
      />
      <ScrollView contentContainerStyle={styles.contentContainer}>
        
       <AppearanceSection
        selectedTheme={selectedTheme}
        onThemeChange={handleThemeChange}
        />
        
        <ModelSettingsSection
          modelSettings={modelSettings}
          defaultSettings={DEFAULT_SETTINGS}
          error={error}
          onSettingsChange={handleSettingsChange}
          onMaxTokensPress={handleMaxTokensPress}
          onStopWordsPress={() => setShowStopWordsDialog(true)}
          onDialogOpen={handleOpenDialog}
          selectedInferenceEngine={selectedInferenceEngine}
          onInferenceEngineChange={handleInferenceEngineChange}
          onOpenSystemPromptDialog={() => setShowSystemPromptDialog(true)}
          onResetSystemPrompt={() => handleSettingsChange({ systemPrompt: DEFAULT_SETTINGS.systemPrompt })}
          enableRemoteModels={enableRemoteModels}
          onToggleRemoteModels={handleRemoteModelsToggle}
          gpuConfig={gpuConfig}
          onToggleGpu={handleGpuToggle}
          onGpuLayersChange={handleGpuLayersChange}
          showAppleFoundationToggle={isAppleDevice}
          appleFoundationEnabled={appleFoundationEnabled}
          onToggleAppleFoundation={handleAppleFoundationToggle}
        />

        <StorageSection
          storageInfo={storageInfo}
          isClearing={isClearing}
          onClearCache={clearCache}
          onClearTempFiles={clearTempFiles}
          onClearAllModels={clearAllModels}
        />

        <SupportSection 
          onOpenLink={openLink} 
          onNavigateToLicenses={() => navigation.navigate('Licenses')}
        />  

        <SystemInfoSection systemInfo={systemInfo} />
        
        {dialogConfig.setting && (
          <ModelSettingDialog
            key={dialogConfig.setting.key ?? dialogConfig.setting.label}
            visible={dialogConfig.visible}
            onClose={handleCloseDialog}
            onSave={async (value) => {
              if (!dialogConfig.setting) {
                return;
              }

              try {
                if (dialogConfig.setting.onSave) {
                  await dialogConfig.setting.onSave(value);
                } else if (dialogConfig.setting.key) {
                  await handleSettingsChange(
                    { [dialogConfig.setting.key]: value } as Partial<typeof modelSettings>
                  );
                }
                handleCloseDialog();
              } catch (error) {
                showDialog('Error', 'Failed to save setting', [
                  <Button key="ok" onPress={hideDialog}>OK</Button>,
                ]);
              }
            }}
            defaultValue={
              dialogConfig.setting.defaultValue ??
              getDefaultValueForKey(dialogConfig.setting.key) ??
              dialogConfig.setting.value
            }
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
        <Dialog
          visible={showAppleFoundationDialog}
          onDismiss={() => setShowAppleFoundationDialog(false)}
        >
          <Dialog.Title>Apple Intelligence</Dialog.Title>
          <Dialog.Content>
            <PaperText>Apple Intelligence not supported on this device.</PaperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowAppleFoundationDialog(false)}>OK</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

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
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  debugButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  debugButtonContent: {
    marginLeft: 12,
    flex: 1,
  },
  debugButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  debugButtonSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
}); 
