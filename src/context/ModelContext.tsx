import React, { createContext, useContext, useState, useCallback } from 'react';
import { llamaManager } from '../utils/LlamaManager';
import { Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ModelContextType {
  selectedModelPath: string | null;
  isModelLoading: boolean;
  loadModel: (modelPath: string) => Promise<void>;
  unloadModel: () => Promise<void>;
}

const ModelContext = createContext<ModelContextType | undefined>(undefined);

export const ModelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedModelPath, setSelectedModelPath] = useState<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<'success' | 'error'>('success');
  const insets = useSafeAreaInsets();

  const showSnackbar = (message: string, type: 'success' | 'error' = 'success') => {
    setSnackbarMessage(message);
    setSnackbarType(type);
    setSnackbarVisible(true);
  };

  const loadModel = useCallback(async (modelPath: string) => {
    try {
      setIsModelLoading(true);
      
      if (!modelPath) {
        throw new Error('Invalid model path');
      }

      if (modelPath !== selectedModelPath) {
        await llamaManager.initializeModel(modelPath);
        
        if (!llamaManager.isInitialized()) {
          throw new Error('Model failed to initialize properly');
        }

        setSelectedModelPath(modelPath);
        showSnackbar('Model loaded successfully');
      }
    } catch (error) {
      console.error('Model loading error:', error);
      showSnackbar(
        error instanceof Error ? error.message : 'Failed to load model',
        'error'
      );
    } finally {
      setIsModelLoading(false);
    }
  }, [selectedModelPath]);

  const unloadModel = useCallback(async () => {
    try {
      setIsModelLoading(true);
      await llamaManager.release();
      setSelectedModelPath(null);
      showSnackbar('Model unloaded');
    } catch (error) {
      console.error('Error unloading model:', error);
      showSnackbar('Failed to unload model', 'error');
    } finally {
      setIsModelLoading(false);
    }
  }, []);

  return (
    <ModelContext.Provider value={{
      selectedModelPath,
      isModelLoading,
      loadModel,
      unloadModel
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