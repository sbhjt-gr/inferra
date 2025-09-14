import React, { createContext, useContext, useState, useEffect } from 'react';
import { llamaManager } from '../utils/LlamaManager';
import { Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';

interface ModelContextType {
  selectedModelPath: string | null;
  selectedProjectorPath: string | null;
  isModelLoading: boolean;
  loadModel: (modelPath: string, mmProjectorPath?: string) => Promise<boolean>;
  unloadModel: () => Promise<void>;
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
    if (isModelLoading) {
      showSnackbar('Model is already loading', 'error');
      return false;
    }

    setIsModelLoading(true);
    
    try {
      if (mmProjectorPath) {
      }
      
      const success = await llamaManager.loadModel(modelPath, mmProjectorPath);
      
      if (success) {
        setSelectedModelPath(modelPath);
        updateProjectorState();
        
        const modelName = modelPath.split('/').pop() || 'Model';
        const multimodalText = mmProjectorPath ? ' (Multimodal)' : '';
        showSnackbar(`${modelName}${multimodalText} loaded successfully`);
        

        return true;
      } else {
        showSnackbar('Failed to load model', 'error');
        setSelectedModelPath(null);
        setSelectedProjectorPath(null);
        setIsMultimodalEnabled(false);
        return false;
      }
    } catch (error) {
      showSnackbar('Error loading model', 'error');
      setSelectedModelPath(null);
      setSelectedProjectorPath(null);
      setIsMultimodalEnabled(false);
      return false;
    } finally {
      setIsModelLoading(false);
    }
  };

  const unloadModel = async (): Promise<void> => {
    try {
      await llamaManager.unloadModel();
    } catch (error) {
      console.error('Error unloading model:', error);
      llamaManager.emergencyCleanup();
    } finally {
      setSelectedModelPath(null);
      setSelectedProjectorPath(null);
      setIsMultimodalEnabled(false);
      showSnackbar('Model unloaded');
    }
  };

  const unloadProjector = async (): Promise<void> => {
    try {
      await llamaManager.releaseMultimodal();
    } catch (error) {
      console.error('Error unloading projector:', error);
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
