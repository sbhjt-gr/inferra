import React, { createContext, useContext, useState, useEffect } from 'react';
import { llamaManager } from '../utils/LlamaManager';
import { Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ModelContextType {
  selectedModelPath: string | null;
  isModelLoading: boolean;
  loadModel: (modelPath: string, mmProjectorPath?: string) => Promise<boolean>;
  unloadModel: () => Promise<void>;
  setSelectedModelPath: (path: string | null) => void;
  isMultimodalEnabled: boolean;
}

const ModelContext = createContext<ModelContextType | undefined>(undefined);

export const ModelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedModelPath, setSelectedModelPath] = useState<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isMultimodalEnabled, setIsMultimodalEnabled] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<'success' | 'error'>('success');
  const insets = useSafeAreaInsets();

  const showSnackbar = (message: string, type: 'success' | 'error' = 'success') => {
    setSnackbarMessage(message);
    setSnackbarType(type);
    setSnackbarVisible(true);
  };

  const loadModel = async (modelPath: string, mmProjectorPath?: string): Promise<boolean> => {
    if (isModelLoading) {
      showSnackbar('Model is already loading', 'error');
      return false;
    }

    setIsModelLoading(true);
    
    try {
      console.log('[ModelContext] Loading model:', modelPath);
      if (mmProjectorPath) {
        console.log('[ModelContext] With multimodal projector:', mmProjectorPath);
      }
      
      const success = await llamaManager.loadModel(modelPath, mmProjectorPath);
      
      if (success) {
        setSelectedModelPath(modelPath);
        setIsMultimodalEnabled(llamaManager.isMultimodalInitialized());
        
        const modelName = modelPath.split('/').pop() || 'Model';
        const multimodalText = mmProjectorPath ? ' (Multimodal)' : '';
        showSnackbar(`${modelName}${multimodalText} loaded successfully`);
        
        console.log('[ModelContext] Model loaded successfully');
        return true;
      } else {
        showSnackbar('Failed to load model', 'error');
        setSelectedModelPath(null);
        setIsMultimodalEnabled(false);
        return false;
      }
    } catch (error) {
      console.error('[ModelContext] Error loading model:', error);
      showSnackbar('Error loading model', 'error');
      setSelectedModelPath(null);
      setIsMultimodalEnabled(false);
      return false;
    } finally {
      setIsModelLoading(false);
    }
  };

  const unloadModel = async (): Promise<void> => {
    try {
      await llamaManager.unloadModel();
      setSelectedModelPath(null);
      setIsMultimodalEnabled(false);
      showSnackbar('Model unloaded');
    } catch (error) {
      console.error('[ModelContext] Error unloading model:', error);
      showSnackbar('Error unloading model', 'error');
    }
  };

  useEffect(() => {
    const unsubscribeLoaded = llamaManager.addListener('model-loaded', (modelPath) => {
      console.log('[ModelContext] Model loaded event:', modelPath);
      setSelectedModelPath(modelPath);
      setIsMultimodalEnabled(llamaManager.isMultimodalInitialized());
    });

    const unsubscribeUnloaded = llamaManager.addListener('model-unloaded', () => {
      console.log('[ModelContext] Model unloaded event');
      setSelectedModelPath(null);
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
      isModelLoading,
      loadModel,
      unloadModel,
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
        }}
      >
        {snackbarMessage}
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