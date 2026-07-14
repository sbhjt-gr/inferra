import React, { createContext, useContext, useState, useEffect } from 'react';
import { fs as FileSystem } from '../services/fs';
import { engineLabels } from '../managers/inference-manager';
import { llamaManager } from '../utils/LlamaManager';
import { engineService } from '../services/runtime-service';
import { Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';
import { modelDownloader } from '../services/ModelDownloader';

interface ModelContextType {
  selectedModelPath: string | null;
  selectedProjectorPath: string | null;
  isModelLoading: boolean;
  loadModel: (modelPath: string, mmProjectorPath?: string) => Promise<boolean>;
  unloadModel: (silent?: boolean) => Promise<void>;
  unloadProjector: () => Promise<void>;
  setSelectedModelPath: (path: string | null) => void;
  isMultimodalEnabled: boolean;
}

const ModelContext = createContext<ModelContextType | undefined>(undefined);

export const ModelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedModelPath, setSelectedModelPath] = useState<string | null>(null);
  const [selectedProjectorPath, setSelectedProjectorPath] = useState<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isMultimodalEnabled, setIsMultimodalEnabled] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<'success' | 'error'>('success');
  const loadingLockRef = React.useRef(false);
  const insets = useSafeAreaInsets();
  const { theme: currentTheme } = useTheme();

  const showSnackbar = (message: string, type: 'success' | 'error' = 'success') => {
    setSnackbarMessage(message);
    setSnackbarType(type);
    setSnackbarVisible(true);
  };

  const updateProjectorState = () => {
    const projectorPath = llamaManager.getMultimodalProjectorPath();
    const multimodalEnabled = llamaManager.isMultimodalInitialized();
    
    setSelectedProjectorPath(projectorPath);
    setIsMultimodalEnabled(multimodalEnabled);
  };

  const loadModel = async (modelPath: string, mmProjectorPath?: string): Promise<boolean> => {
    if (loadingLockRef.current || isModelLoading) {
      showSnackbar('Model is already loading', 'error');
      return false;
    }

    loadingLockRef.current = true;
    setIsModelLoading(true);
    
    try {
      const storedModels = await modelDownloader.getStoredModels();
      const storedEntry = storedModels.find(m => m.path === modelPath);
      const engine = engineService.getEngineForModel(modelPath, storedEntry?.modelFormat);
      const enabled = engineService.getEnabled();

      if (!enabled[engine]) {
        showSnackbar(`${engineLabels[engine]} engine is disabled`, 'error');
        return false;
      }

      const isMlxModel = engine === 'mlx';

      if (!isMlxModel) {
        const fileInfo = await FileSystem.getInfoAsync(modelPath);
        if (!fileInfo.exists) {
          console.log('model_file_missing', modelPath);
          showSnackbar('Model file not found', 'error');
          modelDownloader.refresh();
          return false;
        }
      }
      
      if (mmProjectorPath) {
        const projInfo = await FileSystem.getInfoAsync(mmProjectorPath);
        if (!projInfo.exists) {
          console.log('projector_file_missing', mmProjectorPath);
          mmProjectorPath = undefined;
        }
      }
      
      if (engine !== 'llama' && mmProjectorPath) {
        mmProjectorPath = undefined;
      }

      await engineService.initModel(modelPath, mmProjectorPath, storedEntry?.modelFormat);
      
      setSelectedModelPath(modelPath);
      updateProjectorState();
      
      const modelName = isMlxModel ? modelPath : (modelPath.split('/').pop() || 'Model');
      const engineLabel = ` (${engineLabels[engine]})`;
      const multimodalText = mmProjectorPath ? ' (Multimodal)' : '';

      return true;
    } catch (error) {
      console.log('model_load_error', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMsg.includes('mlx_model_not_downloaded')) {
        showSnackbar('MLX model not found. Please download it first.', 'error');
      } else {
        showSnackbar('Error loading model', 'error');
      }
      
      setSelectedModelPath(null);
      setSelectedProjectorPath(null);
      setIsMultimodalEnabled(false);
      return false;
    } finally {
      loadingLockRef.current = false;
      setIsModelLoading(false);
    }
  };

  const unloadModel = async (silent: boolean = false): Promise<void> => {
    try {
      await engineService.release();
    } catch (error) {
      llamaManager.emergencyCleanup();
    } finally {
      setSelectedModelPath(null);
      setSelectedProjectorPath(null);
      setIsMultimodalEnabled(false);
      if (!silent) {
        showSnackbar('Model unloaded');
      }
    }
  };

  const unloadProjector = async (): Promise<void> => {
    try {
      await llamaManager.releaseMultimodal();
    } catch (error) {
    } finally {
      setSelectedProjectorPath(null);
      setIsMultimodalEnabled(false);
      showSnackbar('Projector model unloaded');
    }
  };

  useEffect(() => {
    const unsubscribeLoaded = llamaManager.addListener('model-loaded', (modelPath: string) => {
      setSelectedModelPath(modelPath);
      updateProjectorState();
    });

    const unsubscribeUnloaded = llamaManager.addListener('model-unloaded', () => {
      setSelectedModelPath(null);
      setSelectedProjectorPath(null);
      setIsMultimodalEnabled(false);
    });

    return () => {
      unsubscribeLoaded();
      unsubscribeUnloaded();
    };
  }, []);

  return (
    <ModelContext.Provider value={{
      selectedModelPath,
      selectedProjectorPath,
      isModelLoading,
      loadModel,
      unloadModel,
      unloadProjector,
      setSelectedModelPath,
      isMultimodalEnabled
    }}>
      {children}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
        style={{
          backgroundColor: snackbarType === 'success' ? '#4a0660' : '#B00020',
          marginBottom: insets.bottom,
        }}
        action={{
          label: 'Dismiss',
          onPress: () => setSnackbarVisible(false),
          textColor: '#FFFFFF',
        }}
      >
        <Text style={{ color: '#FFFFFF' }}>
          {snackbarMessage}
        </Text>
      </Snackbar>
    </ModelContext.Provider>
  );
};

export const useModel = () => {
  const context = useContext(ModelContext);
  if (context === undefined) {
    throw new Error('useModel must be used within a ModelProvider');
  }
  return context;
}; 
