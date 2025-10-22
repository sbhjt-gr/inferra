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

  console.log('hook_init');

  const loadStoredModels = useCallback(async (forceRefresh = false) => {
    console.log('load_models_start', forceRefresh);
    if (loadingRef.current && !forceRefresh) {
      console.log('load_models_skip');
      return;
    }
    loadingRef.current = true;

    try {
      setIsLoading(true);
      console.log('fetching_models');

      const models = await modelDownloader.getStoredModels();
      console.log('models_fetched', models.length);
      setStoredModels(models);
    } catch (error) {
      console.log('load_models_error', error);
      setStoredModels([]);
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
      console.log('load_models_complete');
    }
  }, []);

  const refreshStoredModels = useCallback(async () => {
    console.log('refresh_storage_only');
    setIsRefreshing(true);
    try {
      const models = await modelDownloader.getStoredModels();
      console.log('refresh_complete', models.length);
      setStoredModels(models);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    console.log('hook_mount');
    loadStoredModels();

    const handleModelsChanged = () => {
      console.log('models_changed_event');
      loadStoredModels(true);
    };

    modelDownloader.on('modelsChanged', handleModelsChanged);

    return () => {
      console.log('hook_unmount');
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
