import React, { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  SectionList,
  Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { modelDownloader } from '../services/ModelDownloader';
import { ThemeColors } from '../types/theme';
import { useModel } from '../context/ModelContext';
import { useRemoteModel } from '../context/RemoteModelContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getThemeAwareColor } from '../utils/ColorUtils';
import { onlineModelService } from '../services/OnlineModelService';
import { Dialog, Portal, Text, Button } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { appleFoundationService } from '../services/AppleFoundationService';
import type { ProviderType } from '../services/ModelManagementService';
import { useStoredModels } from '../hooks/useStoredModels';

interface StoredModel {
  name: string;
  path: string;
  size: number;
  modified: string;
  isExternal?: boolean;
  originalPath?: string;
}

interface OnlineModel {
  id: string;
  name: string;
  provider: string;
  isOnline: true;
}

interface AppleFoundationModel {
  id: string;
  name: string;
  provider: string;
  isAppleFoundation: true;
}

type Model = StoredModel | OnlineModel | AppleFoundationModel;

export interface ModelSelectorRef {
  refreshModels: () => void;
}

interface ModelSelectorProps {
  isOpen?: boolean;
  onClose?: () => void;
  preselectedModelPath?: string | null;
  isGenerating?: boolean;
  onModelSelect?: (provider: ProviderType, modelPath?: string, projectorPath?: string) => void | Promise<void>;
  navigation?: NativeStackNavigationProp<RootStackParamList>;
}

interface StorageWarningDialogProps {
  visible: boolean;
  onAccept: (dontShowAgain: boolean) => void;
  onCancel: () => void;
}

const StorageWarningDialog: React.FC<StorageWarningDialogProps> = ({
  visible,
  onAccept,
  onCancel
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme as ThemeColors];
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <Portal>
      <Dialog 
        visible={visible} 
        onDismiss={onCancel}
        style={{
          zIndex: 10000,
          elevation: 10000
        }}
      >
        <Dialog.Title>File Manager Warning</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium" style={{ marginBottom: 16 }}>
            Large model files may cause the file manager to become temporarily stuck on some devices. Please be patient and wait for the file manager to respond once you click on a file.
          </Text>
          
          <TouchableOpacity 
            style={styles.checkboxContainer}
            onPress={() => setDontShowAgain(!dontShowAgain)}
          >
            <View style={[
              styles.checkboxSquare,
              { 
                borderColor: getThemeAwareColor('#4a0660', currentTheme),
                backgroundColor: dontShowAgain ? getThemeAwareColor('#4a0660', currentTheme) : 'transparent'
              }
            ]}>
              {dontShowAgain && (
                <MaterialCommunityIcons 
                  name="check" 
                  size={16} 
                  color="white" 
                />
              )}
            </View>
            <Text style={[styles.checkboxText, { color: themeColors.text }]}>
              Don't show again
            </Text>
          </TouchableOpacity>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel}>Cancel</Button>
          <Button onPress={() => onAccept(dontShowAgain)}>Continue</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const ONLINE_MODELS: OnlineModel[] = [
  { id: 'gemini', name: 'Gemini', provider: 'Google', isOnline: true },
  { id: 'chatgpt', name: 'ChatGPT', provider: 'OpenAI', isOnline: true },
  { id: 'deepseek', name: 'DeepSeek', provider: 'DeepSeek', isOnline: true },
  { id: 'claude', name: 'Claude', provider: 'Anthropic', isOnline: true },
];

interface SectionData {
  title: string;
  data: Model[];
}

const ModelSelector = forwardRef<{ refreshModels: () => void }, ModelSelectorProps>(
  ({ isOpen, onClose, preselectedModelPath, isGenerating, onModelSelect, navigation: propNavigation }, ref) => {
    const { theme: currentTheme } = useTheme();
    const themeColors = theme[currentTheme as ThemeColors];
    const { enableRemoteModels, isLoggedIn } = useRemoteModel();
    const defaultNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const navigation = propNavigation || defaultNavigation;
    const [modalVisible, setModalVisible] = useState(false);
    const { storedModels: models, isRefreshing: isRefreshingLocalModels, refreshStoredModels } = useStoredModels();
    const { selectedModelPath, selectedProjectorPath, isModelLoading, loadModel, unloadModel, unloadProjector, isMultimodalEnabled } = useModel();
    const [onlineModelStatuses, setOnlineModelStatuses] = useState<{[key: string]: boolean}>({
      gemini: false,
      chatgpt: false,
      deepseek: false,
      claude: false
    });
    const [isOnlineModelsExpanded, setIsOnlineModelsExpanded] = useState(false);
    const [isLocalModelsExpanded, setIsLocalModelsExpanded] = useState(true);
    const [isLoadingFromStorage, setIsLoadingFromStorage] = useState(false);
    const [loadingPhase, setLoadingPhase] = useState<'file_picker' | 'processing' | 'loading'>('file_picker');
    const [showStorageWarningDialog, setShowStorageWarningDialog] = useState(false);

    const [dialogVisible, setDialogVisible] = useState(false);
    const [dialogTitle, setDialogTitle] = useState('');
    const [dialogMessage, setDialogMessage] = useState('');
    const [dialogActions, setDialogActions] = useState<React.ReactNode[]>([]);

    const [projectorSelectorVisible, setProjectorSelectorVisible] = useState(false);
    const [projectorModels, setProjectorModels] = useState<StoredModel[]>([]);
    const [selectedVisionModel, setSelectedVisionModel] = useState<Model | null>(null);
  const [appleFoundationEnabled, setAppleFoundationEnabled] = useState(false);
  const [appleFoundationAvailable, setAppleFoundationAvailable] = useState(false);

    const hideDialog = () => setDialogVisible(false);

    const showDialog = (title: string, message: string, actions: React.ReactNode[]) => {
      setDialogTitle(title);
      setDialogMessage(message);
      setDialogActions(actions);
      setDialogVisible(true);
    };

    const hasAnyApiKey = () => {
      return Object.values(onlineModelStatuses).some(status => status);
    };

    const toggleOnlineModelsDropdown = () => {
      setIsOnlineModelsExpanded(!isOnlineModelsExpanded);
    };

    const verifyExternalFileAccess = async (filePath: string): Promise<boolean> => {
      try {
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        return fileInfo.exists;
      } catch (error) {
        return false;
      }
    };

    const handleLoadFromStorage = async () => {
      try {
        const hideWarning = await AsyncStorage.getItem('hideStorageWarning');
        
        setModalVisible(false);
        
        if (hideWarning !== 'true') {
          setShowStorageWarningDialog(true);
          return;
        }
        
        await proceedWithStorageLoad();
      } catch (error) {
        setShowStorageWarningDialog(true);
      }
    };

    const proceedWithStorageLoad = async () => {
      try {
        setIsLoadingFromStorage(true);
        setLoadingPhase('file_picker');

        setTimeout(async () => {
          try {
            const result = await DocumentPicker.getDocumentAsync({
              type: '*/*',
              copyToCacheDirectory: false,
            });

            if (result.canceled) {
              setIsLoadingFromStorage(false);
              return;
            }

            setLoadingPhase('processing');

            const file = result.assets[0];
            const fileName = file.name.toLowerCase();

            if (!fileName.endsWith('.gguf')) {
              setIsLoadingFromStorage(false);
              showDialog(
                'Invalid File',
                'Please select a .gguf model file.',
                [<Button key="ok" onPress={hideDialog}>OK</Button>]
              );
              return;
            }

            const isAccessible = await verifyExternalFileAccess(file.uri);
            if (!isAccessible) {
              setIsLoadingFromStorage(false);
              showDialog(
                'File Not Accessible',
                'The selected file is not accessible. Please try again.',
                [<Button key="ok" onPress={hideDialog}>OK</Button>]
              );
              return;
            }

            const isVisionModel = fileName.includes('llava') || 
                                 fileName.includes('vision') ||
                                 fileName.includes('minicpm');
            
            if (isVisionModel) {
              setIsLoadingFromStorage(false);
              const tempModel: StoredModel = {
                name: file.name,
                path: file.uri,
                size: file.size || 0,
                modified: new Date().toISOString(),
                isExternal: true,
                originalPath: file.uri,
              };
              showMultimodalDialog(tempModel);
            } else {
              setLoadingPhase('loading');
              
              if (onModelSelect) {
                setIsLoadingFromStorage(false);
                onModelSelect('local', file.uri);
              } else {
                const success = await loadModel(file.uri);
                setIsLoadingFromStorage(false);
                if (success) {
                  showDialog(
                    'Model Loaded',
                    `Successfully loaded ${file.name} from storage.`,
                    [<Button key="ok" onPress={hideDialog}>OK</Button>]
                  );
                } else {
                  showDialog(
                    'Load Failed',
                    `Failed to load ${file.name}. The file may be corrupted or incompatible.`,
                    [<Button key="ok" onPress={hideDialog}>OK</Button>]
                  );
                }
              }
            }

          } catch (error) {
            setIsLoadingFromStorage(false);
            showDialog(
              'Error',
              'Failed to load model from storage.',
              [<Button key="ok" onPress={hideDialog}>OK</Button>]
            );
          }
        }, 100);

      } catch (error) {
        setIsLoadingFromStorage(false);
        showDialog(
          'Error',
          'Failed to load model from storage.',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
      }
    };

    const handleStorageWarningAccept = async (dontShowAgain: boolean) => {
      if (dontShowAgain) {
        try {
          await AsyncStorage.setItem('hideStorageWarning', 'true');
        } catch (error) {
        }
      }
      
      setShowStorageWarningDialog(false);
      await proceedWithStorageLoad();
    };

    const handleStorageWarningCancel = () => {
      setShowStorageWarningDialog(false);
    };

    const refreshAppleFoundationState = async () => {
      if (Platform.OS !== 'ios') {
        setAppleFoundationEnabled(false);
        setAppleFoundationAvailable(false);
        return;
      }
      try {
        const available = appleFoundationService.isAvailable();
        const enabled = await appleFoundationService.isEnabled();
        setAppleFoundationAvailable(available);
        setAppleFoundationEnabled(enabled);
      } catch (error) {
        setAppleFoundationAvailable(false);
        setAppleFoundationEnabled(false);
      }
    };

    const sections = useMemo(() => {
      const completedModels = models.filter(model => {
        const isProjectorModel = model.name.toLowerCase().includes('mmproj') ||
                                 model.name.toLowerCase().includes('.proj');

        return !isProjectorModel;
      });

      const sectionsData: SectionData[] = [];
      const localModels: Model[] = [];

      if (Platform.OS === 'ios' && appleFoundationEnabled && appleFoundationAvailable) {
        localModels.push({
          id: 'apple-foundation',
          name: 'Apple Foundation',
          provider: 'Apple Intelligence',
          isAppleFoundation: true,
        });
      }

      localModels.push(...completedModels);

      if (localModels.length > 0) {
        sectionsData.push({ title: 'Local Models', data: localModels });
      }

      sectionsData.push({ title: 'Remote Models', data: ONLINE_MODELS });
      return sectionsData;
    }, [models, appleFoundationEnabled, appleFoundationAvailable]);

    useEffect(() => {
      if (sections.length > 0 && sections[0]?.data?.length > 0) {
        setIsLocalModelsExpanded(true);
      } else if (sections.length > 0 && sections[0]?.data?.length === 0) {
        setIsLocalModelsExpanded(false);
      }
    }, [sections]);

    useEffect(() => {
      refreshAppleFoundationState();
    }, []);

    useImperativeHandle(ref, () => ({
      refreshModels: () => {
        refreshStoredModels();
      }
    }));

    useEffect(() => {
      checkOnlineModelApiKeys();
    }, []);

    const checkOnlineModelApiKeys = async () => {
      try {
        const hasGeminiKey = await onlineModelService.hasApiKey('gemini');
        const hasOpenAIKey = await onlineModelService.hasApiKey('chatgpt');
        const hasDeepSeekKey = await onlineModelService.hasApiKey('deepseek');
        const hasClaudeKey = await onlineModelService.hasApiKey('claude');
        
        const newStatuses = {
          gemini: hasGeminiKey,
          chatgpt: hasOpenAIKey,
          deepseek: hasDeepSeekKey,
          claude: hasClaudeKey
        };
        
        setOnlineModelStatuses(newStatuses);
        
        if (Object.values(newStatuses).some(status => status)) {
          setIsOnlineModelsExpanded(true);
        }
      } catch (error) {
      }
    };

    const handleModelSelect = async (model: Model) => {
      setModalVisible(false);
      
      if (isGenerating) {
        showDialog(
          'Model In Use',
          'Cannot change model while generating a response. Please wait for the current generation to complete or cancel it.',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        return;
      }
      
      if ('isAppleFoundation' in model) {
        if (onModelSelect) {
          onModelSelect('apple-foundation');
        }
        return;
      }
      if ('isOnline' in model) {
        if (!enableRemoteModels || !isLoggedIn) {
          setTimeout(() => {
            showDialog(
              'Remote Models Disabled',
              'Remote models require the "Enable Remote Models" setting to be turned on and you need to be signed in. Would you like to go to Settings to configure this?',
              [
                <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
                <Button 
                  key="settings" 
                  onPress={() => {
                    hideDialog();
                    if (onClose) onClose();
                    navigation.navigate('MainTabs', { screen: 'SettingsTab' });
                  }}
                >
                  Go to Settings
                </Button>
              ]
            );
          }, 300);
          return;
        }
        
        if (!onlineModelStatuses[model.id]) {
          handleApiKeyRequired(model);
          return;
        }
        
        if (onModelSelect) {
          onModelSelect(model.id as 'gemini' | 'chatgpt' | 'deepseek' | 'claude');
        }
      } else {
        const storedModel = model as StoredModel;
        
        const isVisionModel = storedModel.name.toLowerCase().includes('llava') || 
                             storedModel.name.toLowerCase().includes('vision') ||
                             storedModel.name.toLowerCase().includes('minicpm');
        
        if (isVisionModel) {
          showMultimodalDialog(storedModel);
        } else {
          if (onModelSelect) {
            onModelSelect('local', storedModel.path);
          } else {
            await loadModel(storedModel.path);
          }
        }
      }
    };

    const showMultimodalDialog = (model: Model) => {
      showDialog(
        'Vision Model Detected',
        `${model.name} appears to be a vision model. Do you want to load it with multimodal capabilities?`,
        [
          <Button 
            key="text-only" 
            onPress={() => {
              hideDialog();
              setIsLoadingFromStorage(false);
              const storedModel = model as StoredModel;
              const modelPath = storedModel.isExternal && storedModel.originalPath ? storedModel.originalPath : storedModel.path;
              if (onModelSelect) {
                onModelSelect('local', modelPath);
              } else {
                loadModel(modelPath);
              }
            }}
          >
            Text Only
          </Button>,
          <Button 
            key="multimodal" 
            onPress={() => {
              hideDialog();
              promptForProjector(model);
            }}
          >
            With Vision
          </Button>
        ]
      );
    };

    const loadProjectorModels = async () => {
      try {
        const storedModels = await modelDownloader.getStoredModels();
        
        const projectorModels = storedModels.filter(model => 
          model.name.toLowerCase().includes('proj') || 
          model.name.toLowerCase().includes('mmproj') ||
          model.name.toLowerCase().includes('vision') ||
          model.name.toLowerCase().includes('clip')
        );
        setProjectorModels(projectorModels);
      } catch (error) {
        setProjectorModels([]);
      }
    };

    const promptForProjector = async (model: Model) => {
      setIsLoadingFromStorage(false);
      setSelectedVisionModel(model);
      await loadProjectorModels();
      setProjectorSelectorVisible(true);
    };

    const handleProjectorSelect = async (projectorModel: StoredModel) => {
      setProjectorSelectorVisible(false);
      
      if (!selectedVisionModel) return;

      const storedModel = selectedVisionModel as StoredModel;
      const modelPath = storedModel.isExternal && storedModel.originalPath ? storedModel.originalPath : storedModel.path;
      const projectorPath = projectorModel.path;

      if (onModelSelect) {
        showDialog(
          'Multimodal Model Ready',
          `Loading ${selectedVisionModel.name} with vision capabilities using ${projectorModel.name}`,
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        onModelSelect('local', modelPath, projectorPath);
      } else {
        const success = await loadModel(modelPath, projectorPath);
        if (success) {
          showDialog(
            'Success',
            'Vision model loaded successfully! You can now send images and photos.',
            [<Button key="ok" onPress={hideDialog}>OK</Button>]
          );
        }
      }
      setSelectedVisionModel(null);
    };

    const handleProjectorSkip = async () => {
      setProjectorSelectorVisible(false);
      
      if (!selectedVisionModel) return;

      const storedModel = selectedVisionModel as StoredModel;
      const modelPath = storedModel.isExternal && storedModel.originalPath ? storedModel.originalPath : storedModel.path;

      if (onModelSelect) {
        showDialog(
          'Text-Only Model Ready',
          `Loading ${selectedVisionModel.name} in text-only mode (without vision capabilities)`,
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        onModelSelect('local', modelPath);
      } else {
        const success = await loadModel(modelPath);
        if (success) {
          showDialog(
            'Success',
            'Model loaded successfully in text-only mode.',
            [<Button key="ok" onPress={hideDialog}>OK</Button>]
          );
        }
      }
      setSelectedVisionModel(null);
    };

    const handleProjectorSelectorClose = () => {
      setProjectorSelectorVisible(false);
      setSelectedVisionModel(null);
    };

    const handleUnloadModel = () => {
      if (!selectedModelPath) {
        showDialog(
          'No Model Loaded',
          'There is no model currently loaded to unload.',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        return;
      }

      const title = 'Unload Model';
      const message = isGenerating
        ? 'This will stop the current generation. Are you sure you want to unload the model?'
        : 'Are you sure you want to unload the current model?';

      const actions = [
        <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
        <Button key="unload" onPress={async () => {
          hideDialog();
          try {
            await unloadModel();
          } catch (error) {
            showDialog(
              'Unload Warning',
              `Model unloading completed with warnings. The model has been cleared from memory.`,
              [<Button key="ok" onPress={hideDialog}>OK</Button>]
            );
          }
        }}>
          Unload
        </Button>
      ];

      showDialog(title, message, actions);
    };

    const handleUnloadProjector = () => {
      if (!selectedProjectorPath && !isMultimodalEnabled) {
        showDialog(
          'No Projector Loaded',
          'There is no projector model currently loaded to unload.',
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        return;
      }

      const title = 'Unload Projector';
      const message = isGenerating
        ? 'This will disable vision capabilities and stop the current generation. Are you sure you want to unload the projector?'
        : 'Are you sure you want to unload the projector model? This will disable vision capabilities.';

      const actions = [
        <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
        <Button key="unload" onPress={async () => {
          hideDialog();
          try {
            await unloadProjector();
          } catch (error) {
            showDialog(
              'Unload Warning',
              `Projector unloading completed with warnings. Vision capabilities have been disabled.`,
              [<Button key="ok" onPress={hideDialog}>OK</Button>]
            );
          }
        }}>
          Unload Projector
        </Button>
      ];

      showDialog(title, message, actions);
    };

    const handleApiKeyRequired = (model: OnlineModel) => {
      showDialog(
        'API Key Required',
        `${model.name} by ${model.provider} requires an API key. Please configure it in Settings.`,
        [<Button key="ok" onPress={hideDialog}>OK</Button>]
      );
    };

    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B ', 'KB ', 'MB ', 'GB '];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };

    const getDisplayName = (filename: string) => {
      return filename.split('.')[0];
    };

    const getModelNameFromPath = (path: string | null, models: StoredModel[]): string => {
      if (!path) return 'Select a Model';
      
      if (path === 'gemini') return 'Gemini';
      if (path === 'chatgpt') return 'ChatGPT';
      if (path === 'deepseek') return 'DeepSeek';
      if (path === 'claude') return 'Claude';
      if (path === 'apple-foundation') return 'Apple Foundation';
      
      const model = models.find(m => m.path === path);
      return model ? getDisplayName(model.name) : getDisplayName(path.split('/').pop() || '');
    };

    const getProjectorNameFromPath = (path: string | null, models: StoredModel[]): string => {
      if (!path) return '';
      
      const model = models.find(m => m.path === path);
      return model ? getDisplayName(model.name) : getDisplayName(path.split('/').pop() || '');
    };

    const remoteProviders = new Set<ProviderType>(['gemini', 'chatgpt', 'deepseek', 'claude']);

    const isRemoteProvider = (provider: string | null): boolean => {
      if (!provider) return false;
      return remoteProviders.has(provider as ProviderType);
    };

    const isAppleProvider = (provider: string | null): boolean => provider === 'apple-foundation';

    const getActiveModelIcon = (provider: string | null): keyof typeof MaterialCommunityIcons.glyphMap => {
      if (!provider) return 'cube-outline';
      if (isAppleProvider(provider)) return 'apple';
      if (isRemoteProvider(provider)) return 'cloud';
      return 'cube';
    };

    const getConnectionBadgeConfig = (provider: string | null) => {
      if (isRemoteProvider(provider)) {
        return {
          backgroundColor: 'rgba(74, 180, 96, 0.15)',
          textColor: '#2a8c42',
          label: 'REMOTE'
        };
      }
      if (isAppleProvider(provider)) {
        return {
          backgroundColor: 'rgba(74, 6, 96, 0.1)',
          textColor: currentTheme === 'dark' ? '#fff' : '#660880',
          label: 'APPLE'
        };
      }
      return {
        backgroundColor: 'rgba(74, 6, 96, 0.1)',
        textColor: currentTheme === 'dark' ? '#fff' : '#660880',
        label: 'LOCAL'
      };
    };

    const renderAppleFoundationItem = ({ item }: { item: AppleFoundationModel }) => {
      const isSelected = selectedModelPath === item.id;

      return (
        <TouchableOpacity
          style={[
            styles.modelItem,
            { backgroundColor: themeColors.borderColor },
            isSelected && styles.selectedModelItem,
            isGenerating && styles.modelItemDisabled,
          ]}
          onPress={() => handleModelSelect(item)}
          disabled={isGenerating}
        >
          <View style={styles.modelIconContainer}>
            <MaterialCommunityIcons
              name={isSelected ? 'apple' : 'apple'}
              size={28}
              color={isSelected ? (currentTheme === 'dark' ? '#fff' : getThemeAwareColor('#4a0660', currentTheme)) : currentTheme === 'dark' ? '#fff' : themeColors.text}
            />
          </View>
          <View style={styles.modelInfo}>
            <View style={styles.modelNameRow}>
              <Text
                style={[
                  styles.modelName,
                  { color: currentTheme === 'dark' ? '#fff' : themeColors.text },
                  isSelected && { color: currentTheme === 'dark' ? '#fff' : getThemeAwareColor('#4a0660', currentTheme) },
                ]}
              >
                {item.name}
              </Text>
              <View
                style={[
                  styles.connectionTypeBadge,
                  { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(74, 6, 96, 0.1)' },
                ]}
              >
                <Text
                  style={[
                    styles.connectionTypeText,
                    { color: currentTheme === 'dark' ? '#fff' : '#4a0660' },
                  ]}
                >
                  LOCAL
                </Text>
              </View>
            </View>
            <View style={styles.modelMetaInfo}>
              <View
                style={[
                  styles.modelTypeBadge,
                  {
                    backgroundColor: isSelected
                      ? currentTheme === 'dark'
                        ? 'rgba(255, 255, 255, 0.15)'
                        : 'rgba(74, 6, 96, 0.1)'
                      : 'rgba(150, 150, 150, 0.1)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modelTypeText,
                    {
                      color: isSelected
                        ? currentTheme === 'dark'
                          ? '#fff'
                          : '#4a0660'
                        : currentTheme === 'dark'
                          ? '#fff'
                          : themeColors.secondaryText,
                    },
                  ]}
                >
                  {item.provider}
                </Text>
              </View>
            </View>
          </View>
          {isSelected && (
            <View style={styles.selectedIndicator}>
              <MaterialCommunityIcons
                name="check-circle"
                size={24}
                color={currentTheme === 'dark' ? '#fff' : getThemeAwareColor('#4a0660', currentTheme)}
              />
            </View>
          )}
        </TouchableOpacity>
      );
    };

    const renderLocalModelItem = ({ item }: { item: StoredModel }) => (
      <TouchableOpacity
        style={[
          styles.modelItem,
          { backgroundColor: themeColors.borderColor },
          selectedModelPath === item.path && styles.selectedModelItem,
          isGenerating && styles.modelItemDisabled
        ]}
        onPress={() => handleModelSelect(item)}
        disabled={isGenerating}
      >
        <View style={styles.modelIconContainer}>
          <MaterialCommunityIcons 
            name={selectedModelPath === item.path ? "cube" : "cube-outline"} 
            size={28} 
            color={selectedModelPath === item.path ? 
              currentTheme === 'dark' ? '#fff' : getThemeAwareColor('#4a0660', currentTheme) : 
              currentTheme === 'dark' ? '#fff' : themeColors.text} 
          />
        </View>
        <View style={styles.modelInfo}>
          <View style={styles.modelNameRow}>
            <Text style={[
              styles.modelName, 
              { color: currentTheme === 'dark' ? '#fff' : themeColors.text },
              selectedModelPath === item.path && { color: currentTheme === 'dark' ? '#fff' : getThemeAwareColor('#4a0660', currentTheme) }
            ]}>
              {getDisplayName(item.name)}
            </Text>
            <View style={[
              styles.connectionTypeBadge,
              { backgroundColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(74, 6, 96, 0.1)' }
            ]}>
              <Text style={[styles.connectionTypeText, { color: currentTheme === 'dark' ? '#fff' : '#4a0660' }]}>
                LOCAL
              </Text>
            </View>
          </View>
          <View style={styles.modelMetaInfo}>
            <Text style={[styles.modelDetails, { color: currentTheme === 'dark' ? '#fff' : themeColors.secondaryText }]}>
              {formatBytes(item.size)}
            </Text>
          </View>
        </View>
        {selectedModelPath === item.path && (
          <View style={styles.selectedIndicator}>
            <MaterialCommunityIcons 
              name="check-circle" 
              size={24}
              color={currentTheme === 'dark' ? '#fff' : getThemeAwareColor('#4a0660', currentTheme)} 
            />
          </View>
        )}
      </TouchableOpacity>
    );
    
    const renderOnlineModelItem = ({ item }: { item: OnlineModel }) => {
      const isSelected = selectedModelPath === item.id;
      const hasApiKey = onlineModelStatuses[item.id];
      const isRemoteModelsDisabled = !enableRemoteModels || !isLoggedIn;

      return (
        <TouchableOpacity
          style={[
            styles.modelItem,
            { backgroundColor: themeColors.borderColor },
            isSelected && styles.selectedModelItem,
            isGenerating && styles.modelItemDisabled
          ]}
          onPress={() => handleModelSelect(item)}
          disabled={isGenerating}
        >
          <View style={styles.modelIconContainer}>
            <MaterialCommunityIcons 
              name={isSelected ? "cloud" : "cloud-outline"} 
              size={28} 
              color={isSelected || hasApiKey ? 
                currentTheme === 'dark' ? '#fff' : getThemeAwareColor('#4a0660', currentTheme) : 
                currentTheme === 'dark' ? '#fff' : themeColors.secondaryText} 
            />
          </View>
          <View style={styles.modelInfo}>
            <View style={styles.modelNameRow}>
              <Text style={[
                styles.modelName, 
                { color: currentTheme === 'dark' ? '#fff' : themeColors.text },
                isSelected && { color: currentTheme === 'dark' ? '#fff' : getThemeAwareColor('#4a0660', currentTheme) }
              ]}>
                {item.name}
              </Text>
              <View style={[
                styles.connectionTypeBadge,
                { backgroundColor: currentTheme === 'dark' ? 'rgba(74, 180, 96, 0.25)' : 'rgba(74, 180, 96, 0.15)' }
              ]}>
                <Text style={[styles.connectionTypeText, { color: currentTheme === 'dark' ? '#5FD584' : '#2a8c42' }]}>
                  REMOTE
                </Text>
              </View>
            </View>
            <View style={styles.modelMetaInfo}>
              <View style={[
                styles.modelTypeBadge,
                { 
                  backgroundColor: (isSelected || hasApiKey) ? 
                    currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(74, 6, 96, 0.1)' : 
                    'rgba(150, 150, 150, 0.1)' 
                }
              ]}>
                <Text style={[
                  styles.modelTypeText, 
                  { 
                    color: (isSelected || hasApiKey) ? 
                      currentTheme === 'dark' ? '#fff' : '#4a0660' : 
                      currentTheme === 'dark' ? '#fff' : themeColors.secondaryText 
                  }
                ]}>
                  {item.provider}
                </Text>
              </View>
              {isRemoteModelsDisabled && (
                <Text style={[styles.modelApiKeyMissing, { color: currentTheme === 'dark' ? '#FF9494' : '#d32f2f' }]}>
                  Remote models disabled
                </Text>
              )}
            </View>
          </View>
          {isSelected && (
            <View style={styles.selectedIndicator}>
              <MaterialCommunityIcons 
                name="check-circle" 
                size={24} 
                color={currentTheme === 'dark' ? '#fff' : getThemeAwareColor('#4a0660', currentTheme)} 
              />
            </View>
          )}
        </TouchableOpacity>
      );
    };

    const toggleLocalModelsDropdown = () => {
      setIsLocalModelsExpanded(!isLocalModelsExpanded);
    };

    const renderSectionHeader = ({ section }: { section: SectionData }) => {
      if (section.title === 'Remote Models') {
        const hasApiKeys = hasAnyApiKey();
        return (
          <TouchableOpacity 
            onPress={toggleOnlineModelsDropdown}
            style={[
              styles.sectionHeader, 
              { backgroundColor: themeColors.background },
              styles.modelSectionHeader,
              styles.onlineModelsHeader,
              hasApiKeys && styles.onlineModelsHeaderWithKeys,
              currentTheme === 'dark' && {
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderColor: 'rgba(255, 255, 255, 0.2)'
              }
            ]}
          >
            <View style={styles.sectionHeaderContent}>
              <Text style={[
                styles.sectionHeaderText, 
                { color: currentTheme === 'dark' ? '#fff' : themeColors.secondaryText },
                currentTheme === 'dark' && { opacity: 0.9 }
              ]}>
                {section.title}
              </Text>
              <MaterialCommunityIcons 
                name={isOnlineModelsExpanded ? "chevron-up" : "chevron-down"} 
                size={24} 
                color={hasApiKeys ? 
                  currentTheme === 'dark' ? '#5FD584' : getThemeAwareColor('#2a8c42', currentTheme) : 
                  currentTheme === 'dark' ? '#fff' : themeColors.secondaryText} 
              />
            </View>
          </TouchableOpacity>
        );
      }
      
      return (
        <View
          style={[
            styles.sectionHeader,
            { backgroundColor: themeColors.background },
            styles.modelSectionHeader,
            styles.sectionHeaderWithControls,
            currentTheme === 'dark' && {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderColor: 'rgba(255, 255, 255, 0.2)'
            }
          ]}
        >
          <TouchableOpacity
            onPress={toggleLocalModelsDropdown}
            style={styles.sectionHeaderToggle}
          >
            <Text
              style={[
                styles.sectionHeaderText,
                { color: currentTheme === 'dark' ? '#fff' : themeColors.secondaryText },
                currentTheme === 'dark' && { opacity: 0.9 }
              ]}
            >
              {section.title}
            </Text>
            <MaterialCommunityIcons
              name={isLocalModelsExpanded ? "chevron-up" : "chevron-down"}
              size={24}
              color={currentTheme === 'dark' ? '#fff' : themeColors.secondaryText}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={refreshStoredModels}
            style={[
              styles.sectionRefreshButton,
              { backgroundColor: themeColors.borderColor }
            ]}
            disabled={isRefreshingLocalModels}
          >
            {isRefreshingLocalModels ? (
              <ActivityIndicator size="small" color={getThemeAwareColor('#4a0660', currentTheme)} />
            ) : (
              <MaterialCommunityIcons
                name="refresh"
                size={20}
                color={currentTheme === 'dark' ? '#fff' : themeColors.secondaryText}
              />
            )}
          </TouchableOpacity>
        </View>
      );
    };

    const renderItem = ({ item, section }: { item: Model, section: SectionData }) => {
      if (section.title === 'Remote Models' && !isOnlineModelsExpanded) {
        return null;
      }
      if (section.title === 'Local Models' && !isLocalModelsExpanded) {
        return null;
      }
      
      if ('isAppleFoundation' in item) {
        return renderAppleFoundationItem({ item });
      }
      if ('isOnline' in item) {
        return renderOnlineModelItem({ item });
      } else {
        return renderLocalModelItem({ item: item as StoredModel });
      }
    };

    useEffect(() => {
      if (isOpen !== undefined) {
        setModalVisible(isOpen);
      }
    }, [isOpen]);

    useEffect(() => {
      if (modalVisible) {
        refreshAppleFoundationState();
      }
    }, [modalVisible]);

    const handleModalClose = () => {
      setModalVisible(false);
      onClose?.();
    };

    useEffect(() => {
      if (preselectedModelPath && models.length > 0) {
        const preselectedModel = models.find(model => model.path === preselectedModelPath);
        if (preselectedModel) {
          handleModelSelect(preselectedModel);
        }
      }
    }, [preselectedModelPath, models]);


    useEffect(() => {
      if (isGenerating && modalVisible) {
        setModalVisible(false);
      }
    }, [isGenerating]);

    useEffect(() => {
      const unsubscribe = onlineModelService.addListener('api-key-updated', () => {
        checkOnlineModelApiKeys();
      });
      
      return () => {
        unsubscribe();
      };
    }, []);

    const badgeConfig = getConnectionBadgeConfig(selectedModelPath);

    return (
      <>
        <TouchableOpacity
          style={[
            styles.selector, 
            { backgroundColor: themeColors.borderColor },
            (isGenerating || isModelLoading || isLoadingFromStorage) && styles.selectorDisabled
          ]}
          onPress={() => {
            if (isGenerating) {
              showDialog(
                'Model In Use',
                'Cannot change model while generating a response. Please wait for the current generation to complete or cancel it.',
                [<Button key="ok" onPress={hideDialog}>OK</Button>]
              );
              return;
            }
            setModalVisible(true);
          }}
          disabled={isModelLoading || isGenerating || isLoadingFromStorage}
        >
          <View style={styles.selectorContent}>
            <View style={styles.modelIconWrapper}>
              {(isModelLoading || isLoadingFromStorage) ? (
                <ActivityIndicator size="small" color={getThemeAwareColor('#4a0660', currentTheme)} />
              ) : (
                <MaterialCommunityIcons
                  name={getActiveModelIcon(selectedModelPath)}
                  size={24}
                  color={selectedModelPath
                    ? getThemeAwareColor('#4a0660', currentTheme)
                    : currentTheme === 'dark'
                      ? '#fff'
                      : themeColors.text}
                />
              )}
            </View>
            <View style={styles.selectorTextContainer}>
              <Text style={[styles.selectorLabel, { color: currentTheme === 'dark' ? '#fff' : themeColors.secondaryText }]}>
                Active Model
              </Text>
              <View style={styles.modelNameContainer}>
                <Text style={[styles.selectorText, { color: currentTheme === 'dark' ? '#fff' : themeColors.text }]}>
                  {isModelLoading 
                    ? 'Loading...' 
                    : isLoadingFromStorage 
                      ? loadingPhase === 'file_picker' 
                        ? 'Opening File Manager...' 
                        : loadingPhase === 'processing'
                        ? 'Processing File...'
                        : 'Loading Model...'
                      : getModelNameFromPath(selectedModelPath, models)
                  }
                </Text>
                {selectedModelPath && !isModelLoading && !isLoadingFromStorage && (
                  <View style={[
                    styles.connectionTypeBadge,
                    {
                      backgroundColor: badgeConfig.backgroundColor
                    }
                  ]}>
                    <Text style={[
                      styles.connectionTypeText,
                      { color: badgeConfig.textColor }
                    ]}>
                      {badgeConfig.label}
                    </Text>
                  </View>
                )}
              </View>
              {selectedProjectorPath && !isModelLoading && !isLoadingFromStorage && (
                <>
                  <Text style={[styles.projectorLabel, { color: currentTheme === 'dark' ? '#ccc' : themeColors.secondaryText }]}>
                    Vision Projector
                  </Text>
                  <View style={styles.projectorNameContainer}>
                    <MaterialCommunityIcons 
                      name="eye" 
                      size={16} 
                      color={currentTheme === 'dark' ? '#5FD584' : '#2a8c42'} 
                    />
                    <Text style={[styles.projectorText, { color: currentTheme === 'dark' ? '#ccc' : themeColors.secondaryText }]}>
                      {getProjectorNameFromPath(selectedProjectorPath, models)}
                    </Text>
                    <View style={[
                      styles.connectionTypeBadge,
                      { backgroundColor: 'rgba(95, 213, 132, 0.15)' }
                    ]}>
                      <Text style={[styles.connectionTypeText, { color: currentTheme === 'dark' ? '#5FD584' : '#2a8c42' }]}>
                        VISION
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          </View>
          <View style={styles.selectorActions}>
            {selectedProjectorPath && !isModelLoading && !isLoadingFromStorage && (
              <TouchableOpacity 
                onPress={handleUnloadProjector}
                style={[
                  styles.unloadButton,
                  styles.projectorUnloadButton,
                  isGenerating && styles.unloadButtonActive
                ]}
              >
                <MaterialCommunityIcons 
                  name="eye-off" 
                  size={16} 
                  color={isGenerating ? 
                    getThemeAwareColor('#d32f2f', currentTheme) : 
                    currentTheme === 'dark' ? '#5FD584' : '#2a8c42'} 
                />
              </TouchableOpacity>
            )}
            {selectedModelPath && !isModelLoading && !isLoadingFromStorage && (
              <TouchableOpacity 
                onPress={handleUnloadModel}
                style={[
                  styles.unloadButton,
                  isGenerating && styles.unloadButtonActive
                ]}
              >
                <MaterialCommunityIcons 
                  name="close" 
                  size={20} 
                  color={isGenerating ? 
                    getThemeAwareColor('#d32f2f', currentTheme) : 
                    currentTheme === 'dark' ? '#fff' : themeColors.secondaryText} 
                />
              </TouchableOpacity>
            )}
            <MaterialCommunityIcons name="chevron-right" size={20} color={currentTheme === 'dark' ? '#fff' : themeColors.secondaryText} />
          </View>
        </TouchableOpacity>

        <Modal
          visible={modalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={handleModalClose}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: currentTheme === 'dark' ? '#fff' : themeColors.text }]}>
                  Select Model
                </Text>
                <TouchableOpacity 
                  onPress={handleModalClose}
                  style={styles.closeButton}
                >
                  <MaterialCommunityIcons name="close" size={24} color={currentTheme === 'dark' ? '#fff' : themeColors.text} />
                </TouchableOpacity>
              </View>

              <SectionList
                sections={sections}
                keyExtractor={(item) => 'path' in item ? item.path : item.id}
                renderItem={({ item, section }) => renderItem({ item, section })}
                renderSectionHeader={renderSectionHeader}
                contentContainerStyle={styles.modelList}
                stickySectionHeadersEnabled={true}
                ListHeaderComponent={
                  <View>
                    <TouchableOpacity 
                      style={[
                        styles.loadFromStorageModelCard, 
                        { backgroundColor: themeColors.borderColor }
                      ]}
                      onPress={handleLoadFromStorage}
                    >
                      <View style={styles.modelIconContainer}>
                        <MaterialCommunityIcons 
                          name="plus" 
                          size={28} 
                          color={currentTheme === 'dark' ? '#fff' : themeColors.text}
                        />
                      </View>
                      <View style={styles.modelInfo}>
                        <View style={styles.modelNameRow}>
                          <Text style={[
                            styles.modelName, 
                            { color: currentTheme === 'dark' ? '#fff' : themeColors.text }
                          ]}>
                            Load from Storage
                          </Text>
                        </View>
                        <View style={styles.modelMetaInfo}>
                          <Text style={[styles.modelDetails, { color: currentTheme === 'dark' ? '#fff' : themeColors.secondaryText }]}>
                            Load .gguf models directly from device
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                    {models.length === 0 && (
                      <View style={styles.emptyContainer}>
                        <MaterialCommunityIcons name="cube-outline" size={48} color={currentTheme === 'dark' ? '#fff' : themeColors.secondaryText} />
                        <Text style={[styles.emptyText, { color: currentTheme === 'dark' ? '#fff' : themeColors.text }]}>
                          No local models found. Download from Models tab.
                        </Text>
                      </View>
                    )}
                  </View>
                }
                ListEmptyComponent={
                  sections.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <MaterialCommunityIcons name="cube-outline" size={48} color={currentTheme === 'dark' ? '#fff' : themeColors.secondaryText} />
                      <Text style={[styles.emptyText, { color: currentTheme === 'dark' ? '#fff' : themeColors.text }]}>
                        No models available. Please check your connection.
                      </Text>
                    </View>
                  ) : null
                }
              />
            </View>
          </View>
        </Modal>

        <Portal>
          <Dialog visible={dialogVisible} onDismiss={hideDialog}>
            <Dialog.Title>{dialogTitle}</Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium">{dialogMessage}</Text>
            </Dialog.Content>
            <Dialog.Actions>
              {dialogActions}
            </Dialog.Actions>
          </Dialog>

          <Dialog visible={projectorSelectorVisible} onDismiss={handleProjectorSelectorClose}>
            <Dialog.Title>Select Multimodal Projector</Dialog.Title>
            <Dialog.Content>
              <Text style={{ marginBottom: 16, color: currentTheme === 'dark' ? '#fff' : themeColors.text }}>
                Choose a projector (mmproj) model to enable multimodal capabilities:
              </Text>
              {projectorModels.length === 0 ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <MaterialCommunityIcons 
                    name="cube-outline" 
                    size={48} 
                    color={currentTheme === 'dark' ? '#666' : '#ccc'} 
                  />
                  <Text style={{ 
                    marginTop: 12, 
                    textAlign: 'center',
                    color: currentTheme === 'dark' ? '#ccc' : '#666' 
                  }}>
                    No projector models found in your stored models.{'\n'}
                  </Text>
                </View>
              ) : (
                projectorModels.map((model) => (
                  <TouchableOpacity
                    key={model.path}
                    style={[
                      styles.projectorModelItem,
                      { backgroundColor: currentTheme === 'dark' ? '#2a2a2a' : '#f1f1f1' }
                    ]}
                    onPress={() => handleProjectorSelect(model)}
                  >
                    <MaterialCommunityIcons
                      name="cube-outline"
                      size={20}
                      color={currentTheme === 'dark' ? '#fff' : '#000'}
                    />
                    <View style={styles.projectorModelInfo}>
                      <Text style={[
                        styles.projectorModelName,
                        { color: currentTheme === 'dark' ? '#fff' : '#000' }
                      ]}>
                        {model.name}
                      </Text>
                      <Text style={[
                        styles.projectorModelSize,
                        { color: currentTheme === 'dark' ? '#ccc' : '#666' }
                      ]}>
                        {(model.size / (1024 * 1024)).toFixed(1)} MB
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={handleProjectorSkip}>Skip</Button>
              <Button onPress={handleProjectorSelectorClose}>Cancel</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        <StorageWarningDialog
          visible={showStorageWarningDialog}
          onAccept={handleStorageWarningAccept}
          onCancel={handleStorageWarningCancel}
        />
      </>
    );
  }
);

export default ModelSelector;

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    
  },
  selectorContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modelIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  selectorTextContainer: {
    flex: 1,
  },
  selectorText: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unloadButton: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
  },
  modelList: {
    paddingBottom: 20,
    paddingHorizontal: 4,
  },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    marginHorizontal: 4,
  },
  selectedModelItem: {
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
  },
  modelIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modelInfo: {
    flex: 1,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  selectedModelText: {
    color: '#4a0660',
    fontWeight: '600',
  },
  modelMetaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modelDetails: {
    fontSize: 14,
  },
  modelTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
  },
  modelTypeText: {
    fontSize: 12,
    color: '#4a0660',
    fontWeight: '500',
  },
  selectedIndicator: {
    marginLeft: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
    marginTop: 24,
    marginBottom: 16,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.1)',
    borderRadius: 8,
    backgroundColor: 'rgba(150, 150, 150, 0.05)',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 300,
    fontWeight: '500',
  },
  selectorDisabled: {
    opacity: 0.6,
  },
  modelItemDisabled: {
    opacity: 0.6,
  },
  unloadButtonActive: {
    backgroundColor: 'rgba(211, 47, 47, 0.1)',
    borderRadius: 12,
    padding: 4,
  },
  sectionHeader: {
    padding: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  sectionHeaderWithControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeaderToggle: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionRefreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modelSectionHeader: {
    backgroundColor: 'rgba(74, 6, 96, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(74, 6, 96, 0.1)',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  onlineModelsHeader: {
    marginTop: 16,
  },
  modelApiKeyMissing: {
    fontSize: 12,
    fontStyle: 'italic',
    marginLeft: 8,
  },
  modelNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectionTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
  },
  connectionTypeText: {
    fontSize: 10,
    color: '#4a0660',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlineModelsHeaderWithKeys: {
    borderColor: 'rgba(74, 180, 96, 0.3)',
    backgroundColor: 'rgba(74, 180, 96, 0.05)',
  },
  projectorModelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
  },
  projectorModelInfo: {
    flex: 1,
    marginLeft: 12,
  },
  projectorModelName: {
    fontSize: 16,
    fontWeight: '500',
  },
  projectorModelSize: {
    fontSize: 12,
    marginTop: 2,
  },
  projectorLabel: {
    fontSize: 10,
    marginTop: 8,
    marginBottom: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  projectorNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  projectorText: {
    fontSize: 14,
    fontWeight: '500',
  },
  projectorUnloadButton: {
    backgroundColor: 'rgba(95, 213, 132, 0.1)',
    borderRadius: 12,
  },
  loadFromStorageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  loadFromStorageModelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    marginHorizontal: 4,
  },
  loadFromStorageTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  loadFromStorageTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  loadFromStorageDescription: {
    fontSize: 14,
    marginTop: 2,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 6,
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderRadius: 3,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxText: {
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
}); 
