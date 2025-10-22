import { useState, useEffect, useCallback, useRef } from 'react';
import { modelDownloader } from '../services/ModelDownloader';
import { StoredModel } from '../services/ModelDownloaderTypes';

interface UseStoredModelsReturn {
  storedModels: StoredModel[];
  isLoading: boolean;
  isRefreshing: boolean;
  loadStoredModels: (forceRefresh?: boolean) => Promise<void>;
  refreshStoredModels: () => Promise<void>;
}

export const useStoredModels = (): UseStoredModelsReturn => {
  const [storedModels, setStoredModels] = useState<StoredModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const loadingRef = useRef(false);

  const loadStoredModels = useCallback(async (forceRefresh = false) => {
    if (loadingRef.current && !forceRefresh) {
      return;
    }
    loadingRef.current = true;

    try {
      setIsLoading(true);

      if (forceRefresh) {
        await modelDownloader.reloadStoredModels();
      }

      const models = await modelDownloader.getStoredModels();
      setStoredModels(models);
    } catch (error) {
      setStoredModels([]);
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, []);

  const refreshStoredModels = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadStoredModels(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadStoredModels]);

  useEffect(() => {
    loadStoredModels();

    const handleModelsChanged = () => {
      loadStoredModels(true);
    };

    modelDownloader.on('modelsChanged', handleModelsChanged);

    return () => {
      modelDownloader.off('modelsChanged', handleModelsChanged);
    };
  }, [loadStoredModels]);

  return {
    storedModels,
    isLoading,
    isRefreshing,
    loadStoredModels,
    refreshStoredModels,
  };
};
