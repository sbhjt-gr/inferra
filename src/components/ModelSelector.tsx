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
  onModelSelect?: (provider: 'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude', modelPath?: string) => void;
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
    const { selectedModelPath, isModelLoading, loadModel, unloadModel } = useModel();
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
          setModalVisible(false);
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
        if (onModelSelect) {
          onModelSelect('local', model.path);
        } else {
          await loadModel(model.path);
        }
      }
      setModalVisible(false);
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
          onPress={() => {
            if (isRemoteModelsDisabled) {
              setModalVisible(false);
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
            
            if (!onlineModelStatuses[item.id]) {
              handleApiKeyRequired(item);
              return;
            }
            handleModelSelect(item);
          }}
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
      if (section.title === 'Online Models') {
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
      if (section.title === 'Online Models' && !isOnlineModelsExpanded) {
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
            </View>
          </View>
          <View style={styles.selectorActions}>
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
}); 