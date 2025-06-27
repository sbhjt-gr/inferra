import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  SectionList,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { modelDownloader } from '../services/ModelDownloader';
import { ThemeType, ThemeColors } from '../types/theme';
import { useModel } from '../context/ModelContext';
import { useRemoteModel } from '../context/RemoteModelContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getThemeAwareColor } from '../utils/ColorUtils';
import { onlineModelService } from '../services/OnlineModelService';
import { Dialog, Portal, Text, Button } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

interface StoredModel {
  name: string;
  path: string;
  size: number;
  modified: string;
}

interface OnlineModel {
  id: string;
  name: string;
  provider: string;
  isOnline: true;
}

type Model = StoredModel | OnlineModel;

export interface ModelSelectorRef {
  refreshModels: () => void;
}

interface ModelSelectorProps {
  isOpen?: boolean;
  onClose?: () => void;
  preselectedModelPath?: string | null;
  isGenerating?: boolean;
  onModelSelect?: (provider: 'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude', modelPath?: string, projectorPath?: string) => void;
  navigation?: NativeStackNavigationProp<RootStackParamList>;
}

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
    const [models, setModels] = useState<StoredModel[]>([]);
    const [sections, setSections] = useState<SectionData[]>([]);
    const { selectedModelPath, selectedProjectorPath, isModelLoading, loadModel, unloadModel, unloadProjector } = useModel();
    const [onlineModelStatuses, setOnlineModelStatuses] = useState<{[key: string]: boolean}>({
      gemini: false,
      chatgpt: false,
      deepseek: false,
      claude: false
    });
    const [isOnlineModelsExpanded, setIsOnlineModelsExpanded] = useState(false);
    const [isLocalModelsExpanded, setIsLocalModelsExpanded] = useState(true);

    const [dialogVisible, setDialogVisible] = useState(false);
    const [dialogTitle, setDialogTitle] = useState('');
    const [dialogMessage, setDialogMessage] = useState('');
    const [dialogActions, setDialogActions] = useState<React.ReactNode[]>([]);

    const [projectorSelectorVisible, setProjectorSelectorVisible] = useState(false);
    const [projectorModels, setProjectorModels] = useState<StoredModel[]>([]);
    const [selectedVisionModel, setSelectedVisionModel] = useState<Model | null>(null);

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

    const loadModels = async () => {
      try {
        const storedModels = await modelDownloader.getStoredModels();
        const downloadStates = await AsyncStorage.getItem('active_downloads');
        const activeDownloads = downloadStates ? JSON.parse(downloadStates) : {};
        
        const completedModels = storedModels.filter(model => {
          const isDownloading = Object.values(activeDownloads).some(
            (download: any) => 
              download.filename === model.name && 
              download.status !== 'completed'
          );
          return !isDownloading;
        });
        
        setModels(completedModels);
        
        const sections: SectionData[] = [];
        
        if (completedModels.length > 0) {
          sections.push({ title: 'Local Models', data: completedModels });
          setIsLocalModelsExpanded(true);
        } else {
          setIsLocalModelsExpanded(false);
        }
        
        sections.push({ title: 'Remote Models', data: ONLINE_MODELS });
        setSections(sections);
      } catch (error) {
        console.error('Error loading models:', error);
      }
    };

    useEffect(() => {
      loadModels();
    }, []);

    useEffect(() => {
      const checkDownloads = async () => {
        const downloadStates = await AsyncStorage.getItem('active_downloads');
        if (downloadStates) {
          const downloads = JSON.parse(downloadStates);
          const hasCompletedDownload = Object.values(downloads).some(
            (download: any) => download.status === 'completed'
          );
          if (hasCompletedDownload) {
            loadModels();
          }
        }
      };

      const interval = setInterval(checkDownloads, 2000);
      return () => clearInterval(interval);
    }, []);

    useImperativeHandle(ref, () => ({
      refreshModels: loadModels
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
        console.error('Error checking API keys:', error);
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
        const isVisionModel = model.name.toLowerCase().includes('llava') || 
                             model.name.toLowerCase().includes('vision') ||
                             model.name.toLowerCase().includes('minicpm');
        
        if (isVisionModel) {
          showMultimodalDialog(model);
        } else {
          if (onModelSelect) {
            onModelSelect('local', model.path);
          } else {
            await loadModel(model.path);
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
              if (onModelSelect) {
                onModelSelect('local', (model as StoredModel).path);
              } else {
                loadModel((model as StoredModel).path);
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
        console.error('Error loading projector models:', error);
        setProjectorModels([]);
      }
    };

    const promptForProjector = async (model: Model) => {
      setSelectedVisionModel(model);
      await loadProjectorModels();
      setProjectorSelectorVisible(true);
    };

    const handleProjectorSelect = async (projectorModel: StoredModel) => {
      setProjectorSelectorVisible(false);
      
      if (!selectedVisionModel) return;

      if (onModelSelect) {
        showDialog(
          'Multimodal Model Ready',
          `Loading ${selectedVisionModel.name} with vision capabilities using ${projectorModel.name}`,
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        onModelSelect('local', (selectedVisionModel as StoredModel).path, projectorModel.path);
      } else {
        const success = await loadModel((selectedVisionModel as StoredModel).path, projectorModel.path);
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

      if (onModelSelect) {
        showDialog(
          'Text-Only Model Ready',
          `Loading ${selectedVisionModel.name} in text-only mode (without vision capabilities)`,
          [<Button key="ok" onPress={hideDialog}>OK</Button>]
        );
        onModelSelect('local', (selectedVisionModel as StoredModel).path);
      } else {
        const success = await loadModel((selectedVisionModel as StoredModel).path);
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
      const title = 'Unload Model';
      const message = isGenerating
        ? 'This will stop the current generation. Are you sure you want to unload the model?'
        : 'Are you sure you want to unload the current model?';

      const actions = [
        <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
        <Button key="unload" onPress={async () => {
          hideDialog();
          await unloadModel();
        }}>
          Unload
        </Button>
      ];

      showDialog(title, message, actions);
    };

    const handleUnloadProjector = () => {
      const title = 'Unload Projector';
      const message = isGenerating
        ? 'This will disable vision capabilities and stop the current generation. Are you sure you want to unload the projector?'
        : 'Are you sure you want to unload the projector model? This will disable vision capabilities.';

      const actions = [
        <Button key="cancel" onPress={hideDialog}>Cancel</Button>,
        <Button key="unload" onPress={async () => {
          hideDialog();
          await unloadProjector();
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
      
      const model = models.find(m => m.path === path);
      return model ? getDisplayName(model.name) : getDisplayName(path.split('/').pop() || '');
    };

    const getProjectorNameFromPath = (path: string | null, models: StoredModel[]): string => {
      if (!path) return '';
      
      const model = models.find(m => m.path === path);
      return model ? getDisplayName(model.name) : getDisplayName(path.split('/').pop() || '');
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
        <TouchableOpacity 
          onPress={toggleLocalModelsDropdown}
          style={[
            styles.sectionHeader, 
            { backgroundColor: themeColors.background },
            styles.modelSectionHeader,
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
              name={isLocalModelsExpanded ? "chevron-up" : "chevron-down"} 
              size={24} 
              color={currentTheme === 'dark' ? '#fff' : themeColors.secondaryText} 
            />
          </View>
        </TouchableOpacity>
      );
    };

    const renderItem = ({ item, section }: { item: Model, section: SectionData }) => {
      if (section.title === 'Remote Models' && !isOnlineModelsExpanded) {
        return null;
      }
      if (section.title === 'Local Models' && !isLocalModelsExpanded) {
        return null;
      }
      
      if ('isOnline' in item) {
        return renderOnlineModelItem({ item });
      } else {
        return renderLocalModelItem({ item });
      }
    };

    useEffect(() => {
      if (isOpen !== undefined) {
        setModalVisible(isOpen);
      }
    }, [isOpen]);

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

    return (
      <>
        <TouchableOpacity
          style={[
            styles.selector, 
            { backgroundColor: themeColors.borderColor },
            (isGenerating || isModelLoading) && styles.selectorDisabled
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
          disabled={isModelLoading || isGenerating}
        >
          <View style={styles.selectorContent}>
            <View style={styles.modelIconWrapper}>
              {isModelLoading ? (
                <ActivityIndicator size="small" color={getThemeAwareColor('#4a0660', currentTheme)} />
              ) : (
                <MaterialCommunityIcons 
                  name={selectedModelPath ? 
                    (selectedModelPath === 'gemini' || 
                     selectedModelPath === 'chatgpt' || 
                     selectedModelPath === 'deepseek' || 
                     selectedModelPath === 'claude') ? 
                      "cloud" : "cube" 
                    : "cube-outline"} 
                  size={24} 
                  color={selectedModelPath ? 
                    getThemeAwareColor('#4a0660', currentTheme) : 
                    currentTheme === 'dark' ? '#fff' : themeColors.text} 
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
                    : getModelNameFromPath(selectedModelPath, models)
                  }
                </Text>
                {selectedModelPath && !isModelLoading && (
                  <View style={[
                    styles.connectionTypeBadge,
                    { 
                      backgroundColor: (selectedModelPath === 'gemini' || 
                                       selectedModelPath === 'chatgpt' || 
                                       selectedModelPath === 'deepseek' || 
                                       selectedModelPath === 'claude') ? 
                        'rgba(74, 180, 96, 0.15)' : 
                        'rgba(74, 6, 96, 0.1)' 
                    }
                  ]}>
                    <Text style={[
                      styles.connectionTypeText, 
                      { 
                        color: (selectedModelPath === 'gemini' || 
                                selectedModelPath === 'chatgpt' || 
                                selectedModelPath === 'deepseek' || 
                                selectedModelPath === 'claude') ? 
                          '#2a8c42' : 
                          currentTheme === 'dark' ? '#fff' : '#660880' 
                      }
                    ]}>
                      {(selectedModelPath === 'gemini' || 
                        selectedModelPath === 'chatgpt' || 
                        selectedModelPath === 'deepseek' || 
                        selectedModelPath === 'claude') ? 'REMOTE' : 'LOCAL'}
                    </Text>
                  </View>
                )}
              </View>
              {selectedProjectorPath && !isModelLoading && (
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
            {selectedProjectorPath && !isModelLoading && (
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
            {selectedModelPath && !isModelLoading && (
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
                  models.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <MaterialCommunityIcons name="cube-outline" size={48} color={currentTheme === 'dark' ? '#fff' : themeColors.secondaryText} />
                      <Text style={[styles.emptyText, { color: currentTheme === 'dark' ? '#fff' : themeColors.text }]}>
                        No local models found. Go to the Models → Download Models screen to download a Model.
                      </Text>
                    </View>
                  ) : null
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

        {/* Dialog Portal */}
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

          {/* Projector Selector Dialog */}
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
}); 