import { onlineModelService } from './OnlineModelService';
import { llamaManager } from '../utils/LlamaManager';
import chatManager from '../utils/ChatManager';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export interface ModelSelectorOptions {
  model: string;
  modelPath?: string;
  projectorPath?: string;
  isLoading: boolean;
  isRegenerating: boolean;
  enableRemoteModels: boolean;
  isLoggedIn: boolean;
  loadModel: (path: string, projectorPath?: string) => Promise<void>;
  unloadModel: () => Promise<void>;
}

export interface ModelInfo {
  name: string;
  iconName: keyof typeof MaterialCommunityIcons.glyphMap;
  currentModelPath: string | null;
}

export class ModelManagementService {
  
  static async handleModelSelect(
    options: ModelSelectorOptions,
    setActiveProvider: (provider: string | null) => void,
    setSelectedModelPath: (path: string | null) => void,
    showDialog: (title: string, message: string, actions: any[]) => void,
    hideDialog: () => void,
    navigation: any
  ): Promise<void> {
    const { model, modelPath, projectorPath, isLoading, isRegenerating, enableRemoteModels, isLoggedIn, loadModel, unloadModel } = options;

    if (isLoading || isRegenerating) {
      showDialog(
        'Please Wait',
        'Please wait for the current operation to complete before switching models.',
        [{ key: 'ok', text: 'OK', onPress: hideDialog }]
      );
      return;
    }

    if (model !== 'local' && (!enableRemoteModels || !isLoggedIn)) {
      showDialog(
        'Remote Models Disabled',
        'Remote models require the "Enable Remote Models" setting to be turned on and you need to be signed in. Would you like to go to Settings to configure this?',
        [
          { key: 'cancel', text: 'Cancel', onPress: hideDialog },
          { 
            key: 'settings', 
            text: 'Go to Settings',
            onPress: () => {
              hideDialog();
              navigation.navigate('MainTabs', { screen: 'SettingsTab' });
            }
          }
        ]
      );
      return;
    }
    
    if (model === 'local') {
      if (modelPath) {
        await loadModel(modelPath, projectorPath);
      }
      setActiveProvider('local');
      chatManager.setCurrentProvider('local');
    } else {
      if (model === 'gemini') {
        const hasApiKey = await onlineModelService.hasApiKey('gemini');
        if (!hasApiKey) {
          showDialog(
            'API Key Required',
            'Please set your Gemini API key in Settings before using this model.',
            [
              { 
                key: 'settings',
                text: 'Go to Settings', 
                onPress: () => {
                  hideDialog();
                  navigation.navigate('MainTabs', { screen: 'SettingsTab' });
                }
              },
              { key: 'cancel', text: 'Cancel', onPress: hideDialog }
            ]
          );
          return;
        }
        await unloadModel();
        setActiveProvider('gemini');
        setSelectedModelPath('gemini');
        chatManager.setCurrentProvider('gemini');
      } else if (model === 'chatgpt' || model === 'deepseek' || model === 'claude') {
        await unloadModel();
        setActiveProvider(model);
        setSelectedModelPath(model);
        chatManager.setCurrentProvider(model);
      }
    }
  }

  static getModelInfo(activeProvider: string | null): ModelInfo {
    let modelName = 'Select a Model';
    let iconName: keyof typeof MaterialCommunityIcons.glyphMap = "cube-outline";
    let currentModelPath = activeProvider === 'local' ? llamaManager.getModelPath() : activeProvider;
    
    if (activeProvider === 'local') {
      const modelPath = llamaManager.getModelPath();
      if (modelPath) {
        const modelFileName = modelPath.split('/').pop() || '';
        modelName = modelFileName.split('.')[0];
        iconName = "cube";
      }
    } else if (activeProvider === 'gemini') {
      modelName = 'Gemini';
      iconName = "cloud";
    } else if (activeProvider === 'chatgpt') {
      modelName = 'gpt-4o';
      iconName = "cloud";
    } else if (activeProvider === 'deepseek') {
      modelName = 'deepseek-r1';
      iconName = "cloud";
    } else if (activeProvider === 'claude') {
      modelName = 'Claude';
      iconName = "cloud";
    }

    return { name: modelName, iconName, currentModelPath };
  }

  static setupModelChangeListeners(
    activeProvider: string | null,
    setActiveProvider: (provider: string | null) => void
  ) {
    const handleModelChange = () => {
      const modelPath = llamaManager.getModelPath();
      if (modelPath) {
        setActiveProvider('local');
        chatManager.setCurrentProvider('local');
      } else if (activeProvider === 'local') {
        setActiveProvider(null);
        chatManager.setCurrentProvider('local');
      }
    };
    
    const handleModelUnload = () => {
      if (activeProvider === 'local') {
        setActiveProvider(null);
      }
    };
    
    handleModelChange();
    
    const unsubscribeLoaded = llamaManager.addListener('model-loaded', handleModelChange);
    const unsubscribeUnloaded = llamaManager.addListener('model-unloaded', handleModelUnload);
    
    return () => {
      unsubscribeLoaded();
      unsubscribeUnloaded();
    };
  }
}
