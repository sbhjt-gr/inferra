import React, { useState, useEffect, forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import {
  View,
  Animated,
  Easing,
  Dimensions,
  TouchableOpacity,
  BackHandler,
  ActivityIndicator,
  SectionList,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { theme } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { modelDownloader } from '../services/ModelDownloader';
import { ThemeColors } from '../types/theme';
import { useModel } from '../context/ModelContext';
import { useRemoteModel } from '../context/RemoteModelContext';
import { getThemeAwareColor } from '../utils/ColorUtils';
import { onlineModelService } from '../services/OnlineModelService';
import { engineLabels } from '../managers/inference-manager';
import { engineService } from '../services/runtime-service';
import { llamaManager } from '../utils/LlamaManager';
import { Portal, Text } from 'react-native-paper';
import Dialog from './Dialog';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { appleFoundationService } from '../services/AppleFoundationService';
import type { ProviderType } from '../services/ModelManagementService';
import { LLAMA_INIT_CONFIG } from '../config/llamaConfig';
import { useStoredModels } from '../hooks/useStoredModels';
import type { StoredModel, OnlineModel, AppleFoundationModel, MLXGroup, Model, ModelSelectorRef, ModelSelectorProps, SectionData } from './ModelSelector.types';
import { ONLINE_MODELS } from './ModelSelector.constants';
import { formatBytes, getDisplayName, getModelNameFromPath, getProjectorNameFromPath, isMLXModel, groupMLXModels, getActiveModelIcon, getConnectionBadgeConfig } from './ModelSelector.utils';
import { styles } from './ModelSelector.styles';
import { renderAppleFoundationItem, renderLocalModelItem, renderOnlineModelItem, renderSectionHeader, renderItem, type RenderContext } from './ModelSelector.renderers';

export type { ModelSelectorRef } from './ModelSelector.types';

const initKey = 'model_selector_init_v1';

type InitOverrides = {
  n_ctx: number;
  n_batch: number;
  n_parallel: number;
  n_threads: number;
  n_gpu_layers: number;
};

const defaultInit: InitOverrides = {
  n_ctx: LLAMA_INIT_CONFIG.n_ctx,
  n_batch: LLAMA_INIT_CONFIG.n_batch,
  n_parallel: LLAMA_INIT_CONFIG.n_parallel,
  n_threads: LLAMA_INIT_CONFIG.n_threads,
  n_gpu_layers: LLAMA_INIT_CONFIG.n_gpu_layers,
};

const toNum = (value: unknown, fallback: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.round(value);
};

const parseInit = (raw: string): InitOverrides => {
  try {
    const parsed = JSON.parse(raw) as Partial<InitOverrides>;
    return {
      n_ctx: toNum(parsed.n_ctx, defaultInit.n_ctx),
      n_batch: toNum(parsed.n_batch, defaultInit.n_batch),
      n_parallel: toNum(parsed.n_parallel, defaultInit.n_parallel),
      n_threads: toNum(parsed.n_threads, defaultInit.n_threads),
      n_gpu_layers: toNum(parsed.n_gpu_layers, defaultInit.n_gpu_layers),
    };
  } catch {
    return defaultInit;
  }
};

const getDir = (path: string) => {
  const normalized = path.replace(/\/+$|\/+$/g, '');
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : '';
};

const getFile = (path: string) => {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
};

const hasCompleteMlxPackage = (files: StoredModel[]) => {
  if (files.some(file => file.isDirectory && file.modelFormat === 'mlx')) {
    return true;
  }

  const names = new Set(files.map(file => getFile(file.path).toLowerCase()));
  const hasRequiredConfig =
    names.has('config.json') &&
    names.has('tokenizer.json') &&
    names.has('tokenizer_config.json');
  const hasWeights = files.some(file => {
    const name = getFile(file.path).toLowerCase();
    return name.endsWith('.safetensors') || name.endsWith('.npz');
  });
  return hasRequiredConfig && hasWeights;
};

const ModelSelector = forwardRef<{ refreshModels: () => void }, ModelSelectorProps>(
  ({ isOpen, onClose, preselectedModelPath, isGenerating, onModelSelect }, ref) => {
    const { theme: currentTheme } = useTheme();
    const themeColors = theme[currentTheme as ThemeColors];
    const { enableRemoteModels, isLoggedIn } = useRemoteModel();
    const router = useRouter();
    const [modalVisible, setModalVisible] = useState(false);
    const { storedModels: models, isLoading: isLoadingLocalModels, isRefreshing: isRefreshingLocalModels, refreshStoredModels } = useStoredModels();
    const { selectedModelPath, selectedProjectorPath, isModelLoading, loadModel, unloadModel, unloadProjector, isMultimodalEnabled } = useModel();
    const [onlineModelStatuses, setOnlineModelStatuses] = useState<{[key: string]: boolean}>({
      gemini: false,
      chatgpt: false,
      claude: false
    });
    const [cloneModels, setCloneModels] = useState<OnlineModel[]>([]);
    const [remoteNames, setRemoteNames] = useState<Record<string, string>>({});
    const [isOnlineModelsExpanded, setIsOnlineModelsExpanded] = useState(false);
    const [isLocalModelsExpanded, setIsLocalModelsExpanded] = useState(true);

    const [dialogVisible, setDialogVisible] = useState(false);
    const [dialogTitle, setDialogTitle] = useState('');
    const [dialogMessage, setDialogMessage] = useState('');
    const [dialogPrimaryText, setDialogPrimaryText] = useState<string | undefined>();
    const [dialogPrimaryPress, setDialogPrimaryPress] = useState<(() => void) | undefined>();
    const [dialogSecondaryText, setDialogSecondaryText] = useState<string | undefined>();
    const [dialogSecondaryPress, setDialogSecondaryPress] = useState<(() => void) | undefined>();

    const [projectorSelectorVisible, setProjectorSelectorVisible] = useState(false);
    const [projectorModels, setProjectorModels] = useState<StoredModel[]>([]);
    const [selectedVisionModel, setSelectedVisionModel] = useState<Model | null>(null);
  const [appleFoundationEnabled, setAppleFoundationEnabled] = useState(false);
  const [appleFoundationAvailable, setAppleFoundationAvailable] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [initOverrides, setInitOverrides] = useState<InitOverrides>(defaultInit);
    const [initHydrated, setInitHydrated] = useState(false);
    const [showInitPanel, setShowInitPanel] = useState(false);
    const getScreenH = () => Dimensions.get('window').height;
    const slideAnim = useRef(new Animated.Value(getScreenH())).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;
    const [overlayActive, setOverlayActive] = useState(false);
    const modelSelectInFlightRef = useRef(false);
    const handledPreselectedPathRef = useRef<string | null>(null);

    const hideDialog = () => setDialogVisible(false);

    const showDialog = (title: string, message: string, primary?: { label: string; onPress: () => void }, secondary?: { label: string; onPress: () => void }) => {
      setDialogTitle(title);
      setDialogMessage(message);
      const autoClose = () => setDialogVisible(false);
      setDialogPrimaryText(primary?.label ?? 'OK');
      setDialogPrimaryPress(() => (primary ? primary.onPress : autoClose));
      setDialogSecondaryText(secondary?.label);
      setDialogSecondaryPress(secondary ? () => secondary.onPress : undefined);
      setDialogVisible(true);
    };

    const hasAnyApiKey = () => {
      return Object.values(onlineModelStatuses).some(status => status);
    };

    const toggleOnlineModelsDropdown = () => {
      setIsOnlineModelsExpanded(!isOnlineModelsExpanded);
    };

    const toggleGroup = (key: string) => {
      setExpandedGroups(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
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
      const visibleModels = (() => {
        const withoutTemp = models.filter(model => {
          const lowerName = model.name.toLowerCase();
          const lowerPath = model.path.toLowerCase();
          return !lowerName.startsWith('temp_mlx_') && !lowerPath.includes('/temp_mlx_');
        });

        const mlxFiles = withoutTemp.filter(model => {
          const lowerPath = model.path.toLowerCase();
          return lowerPath.includes('/models/mlx/') || model.modelFormat === 'mlx';
        });

        const mlxByDir = mlxFiles.reduce<Record<string, StoredModel[]>>((acc, model) => {
          const dir = model.isDirectory ? model.path : getDir(model.path);
          if (!dir) {
            return acc;
          }
          if (!acc[dir]) {
            acc[dir] = [];
          }
          acc[dir].push(model);
          return acc;
        }, {});

        const incompleteDirs = new Set(
          Object.entries(mlxByDir)
            .filter(([, files]) => !hasCompleteMlxPackage(files))
            .map(([dir]) => dir)
        );

        return withoutTemp.filter(model => {
          const lowerPath = model.path.toLowerCase();
          if (!lowerPath.includes('/models/mlx/')) {
            return true;
          }
          const dirKey = model.isDirectory ? model.path : getDir(model.path);
          return !incompleteDirs.has(dirKey);
        });
      })();

      const completedModels = visibleModels.filter(model => {
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

      const mlxModels = completedModels.filter(isMLXModel);
      const nonMlxModels = completedModels.filter(model => !isMLXModel(model));
      const groupedMlx = groupMLXModels(mlxModels);

      localModels.push(...nonMlxModels, ...groupedMlx);

      if (localModels.length > 0) {
        sectionsData.push({ title: 'Local Models', data: localModels });
      }

      const namedOnline = ONLINE_MODELS.map(m => ({
        ...m,
        name: remoteNames[m.id] || m.name,
      }));
      sectionsData.push({ title: 'Remote Models', data: [...namedOnline, ...cloneModels] });
      return sectionsData;
    }, [models, appleFoundationEnabled, appleFoundationAvailable, cloneModels, remoteNames]);

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

    const loadRemoteNames = async () => {
      const names: Record<string, string> = {};
      for (const m of ONLINE_MODELS) {
        const saved = await onlineModelService.getModelName(m.id);
        if (saved) names[m.id] = saved;
        else names[m.id] = onlineModelService.getDefaultModelName(m.id);
      }
      setRemoteNames(names);
    };

    useEffect(() => {
      checkOnlineModelApiKeys();
      loadCloneModels();
      loadRemoteNames();
    }, []);

    const loadCloneModels = async () => {
      try {
        const clones = (await onlineModelService.listClones()).filter(c => ['gemini', 'chatgpt', 'claude'].includes(c.baseProvider));
        const models = await Promise.all(clones.map(async c => {
          const savedModel = await onlineModelService.getModelName(c.id);
          const modelName = savedModel || onlineModelService.getDefaultModelName(c.baseProvider);
          return {
            id: c.id,
            name: modelName,
            provider: c.baseProvider,
            isOnline: true as const,
          };
        }));
        setCloneModels(models);
        return clones;
      } catch (error) {
        return [];
      }
    };

    const checkOnlineModelApiKeys = async () => {
      try {
        const hasGeminiKey = await onlineModelService.hasApiKey('gemini');
        const hasOpenAIKey = await onlineModelService.hasApiKey('chatgpt');
        const hasClaudeKey = await onlineModelService.hasApiKey('claude');

        const clones = (await onlineModelService.listClones()).filter(c => ['gemini', 'chatgpt', 'claude'].includes(c.baseProvider));
        const cloneStatuses: {[key: string]: boolean} = {};
        for (const clone of clones) {
          cloneStatuses[clone.id] = await onlineModelService.hasApiKey(clone.id);
        }
        
        const newStatuses = {
          gemini: hasGeminiKey,
          chatgpt: hasOpenAIKey,
          claude: hasClaudeKey,
          ...cloneStatuses,
        };
        
        setOnlineModelStatuses(newStatuses);
        
        if (Object.values(newStatuses).some(status => status)) {
          setIsOnlineModelsExpanded(true);
        }
      } catch (error) {
      }
    };

    const applyInitOverride = (key: keyof InitOverrides, value: number) => {
      setInitOverrides(prev => ({
        ...prev,
        [key]: Math.round(value),
      }));
    };

    const resetInitOverrides = () => {
      setInitOverrides(defaultInit);
    };

    useEffect(() => {
      let mounted = true;

      const loadInit = async () => {
        try {
          const raw = await AsyncStorage.getItem(initKey);
          if (!mounted) return;
          if (raw) {
            setInitOverrides(parseInit(raw));
          }
        } catch {
        } finally {
          if (mounted) {
            setInitHydrated(true);
          }
        }
      };

      loadInit();

      return () => {
        mounted = false;
      };
    }, []);

    useEffect(() => {
      if (!initHydrated) {
        return;
      }

      const saveInit = async () => {
        try {
          await AsyncStorage.setItem(initKey, JSON.stringify(initOverrides));
        } catch {
        }
      };

      saveInit();
    }, [initOverrides, initHydrated]);

    const executeLocalLoad = async (
      modelPath: string,
      projectorPath?: string,
      mode: 'default' | 'text' | 'vision' = 'default',
      visionModelName?: string,
      projectorName?: string,
    ) => {
      if (onModelSelect) {
        onModelSelect('local', modelPath, projectorPath);
        return;
      }

      const success = await loadModel(modelPath, projectorPath);
      if (!success) {
        return;
      }

      if (mode === 'vision') {
        showDialog(
          'Success',
          'Vision model loaded successfully! You can now send images and photos.'
        );
      } else if (mode === 'text') {
        showDialog(
          'Success',
          'Model loaded successfully in text-only mode.'
        );
      }
    };

    const startLocalLoad = async (
      modelPath: string,
      projectorPath?: string,
      mode: 'default' | 'text' | 'vision' = 'default',
      visionModelName?: string,
      projectorName?: string,
      modelFormat?: string,
    ) => {
      const engine = engineService.getEngineForModel(modelPath, modelFormat);
      if (engine === 'llama') {
        llamaManager.setInitOverrides(initOverrides);
      } else {
        llamaManager.clearInitOverrides();
      }
      await executeLocalLoad(modelPath, projectorPath, mode, visionModelName, projectorName);
    };

    const handleModelSelect = async (model: Model) => {
      if (modelSelectInFlightRef.current) {
        return;
      }

      modelSelectInFlightRef.current = true;
      setModalVisible(false);
      try {
        if (isGenerating) {
          showDialog(
            'Model In Use',
            'Cannot change model while generating a response. Please wait for the current generation to complete or cancel it.'
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
                { label: 'Go to Settings', onPress: () => { hideDialog(); if (onClose) onClose(); router.push('/(tabs)/settings'); } },
                { label: 'Cancel', onPress: hideDialog }
              );
            }, 300);
            return;
          }

          if (!onlineModelStatuses[model.id]) {
            setTimeout(() => {
              handleApiKeyRequired(model);
            }, 300);
            return;
          }

          if (onModelSelect) {
            onModelSelect(model.id as ProviderType);
          }
        } else {
          const storedModel = model as StoredModel;
          const modelPath = storedModel.isExternal && storedModel.originalPath ? storedModel.originalPath : storedModel.path;
          const nameLower = (storedModel.name || '').toLowerCase();

          if (selectedModelPath === modelPath && !isModelLoading) {
            return;
          }

          const engine = engineService.getEngineForModel(modelPath, storedModel.modelFormat);
          const enabled = engineService.getEnabled();

          if (!enabled[engine]) {
            showDialog(
              'Engine Disabled',
              `${engineLabels[engine]} is disabled. Enable it in Settings to load this model.`
            );
            return;
          }

          const isVisionModel = nameLower.includes('llava') || 
                              nameLower.includes('vision') ||
                              nameLower.includes('minicpm');

          if (isVisionModel && engine === 'llama') {
            showMultimodalDialog(storedModel);
          } else {
            await startLocalLoad(modelPath, undefined, 'default', undefined, undefined, storedModel.modelFormat);
          }
        }
      } finally {
        modelSelectInFlightRef.current = false;
      }
    };

    const showMultimodalDialog = (model: Model) => {
      showDialog(
        'Vision Model Detected',
        `${model.name} appears to be a vision model. Do you want to load it with multimodal capabilities?`,
        {
          label: 'With Vision',
          onPress: () => {
            hideDialog();
            promptForProjector(model);
          }
        },
        {
          label: 'Text Only',
          onPress: () => {
            hideDialog();
            const storedModel = model as StoredModel;
            const modelPath = storedModel.isExternal && storedModel.originalPath ? storedModel.originalPath : storedModel.path;
            void startLocalLoad(modelPath, undefined, 'text', model.name, undefined, storedModel.modelFormat);
          }
        }
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
      await startLocalLoad(modelPath, projectorPath, 'vision', selectedVisionModel.name, projectorModel.name, storedModel.modelFormat);
      setSelectedVisionModel(null);
    };

    const handleProjectorSkip = async () => {
      setProjectorSelectorVisible(false);
      
      if (!selectedVisionModel) return;

      const storedModel = selectedVisionModel as StoredModel;
      const modelPath = storedModel.isExternal && storedModel.originalPath ? storedModel.originalPath : storedModel.path;

      await startLocalLoad(modelPath, undefined, 'text', selectedVisionModel.name, undefined, storedModel.modelFormat);
      setSelectedVisionModel(null);
    };

    const handleProjectorSelectorClose = () => {
      setProjectorSelectorVisible(false);
      setSelectedVisionModel(null);
    };

    const handleLoadProjector = async () => {
      if (!selectedModelPath) return;
      const model = models.find(m => m.path === selectedModelPath);
      if (!model) return;
      setSelectedVisionModel(model);
      await loadProjectorModels();
      setProjectorSelectorVisible(true);
    };

    const loadedLocalModel = selectedModelPath
      ? models.find(m => m.path === selectedModelPath || m.path === selectedModelPath)
      : undefined;

    const isGgufLoaded = !!loadedLocalModel &&
      !isModelLoading &&
      !isMLXModel(loadedLocalModel) &&
      engineService.getEngineForModel(loadedLocalModel.path, loadedLocalModel.modelFormat) === 'llama';

    const showLoadProjector = isGgufLoaded && !selectedProjectorPath && !isMultimodalEnabled;

    const handleUnloadModel = () => {
      if (!selectedModelPath) {
        showDialog(
          'No Model Loaded',
          'There is no model currently loaded to unload.'
        );
        return;
      }

      const title = 'Unload Model';
      const message = isGenerating
        ? 'This will stop the current generation. Are you sure you want to unload the model?'
        : 'Are you sure you want to unload the current model?';

      showDialog(title, message,
        {
          label: 'Unload',
          onPress: async () => {
            hideDialog();
            try {
              await unloadModel();
            } catch (error) {
              showDialog(
                'Unload Warning',
                `Model unloading completed with warnings. The model has been cleared from memory.`
              );
            }
          }
        },
        { label: 'Cancel', onPress: hideDialog }
      );
    };

    const handleUnloadProjector = () => {
      if (!selectedProjectorPath && !isMultimodalEnabled) {
        showDialog(
          'No Projector Loaded',
          'There is no projector model currently loaded to unload.'
        );
        return;
      }

      const title = 'Unload Projector';
      const message = isGenerating
        ? 'This will disable vision capabilities and stop the current generation. Are you sure you want to unload the projector?'
        : 'Are you sure you want to unload the projector model? This will disable vision capabilities.';

      showDialog(title, message,
        {
          label: 'Unload Projector',
          onPress: async () => {
            hideDialog();
            try {
              await unloadProjector();
            } catch (error) {
              showDialog(
                'Unload Warning',
                `Projector unloading completed with warnings. Vision capabilities have been disabled.`
              );
            }
          }
        },
        { label: 'Cancel', onPress: hideDialog }
      );
    };

    const handleApiKeyRequired = (model: OnlineModel) => {
      showDialog(
        'API Key Required',
        `${model.name} by ${model.provider} requires an API key. Please configure it in Models > Remote Models.`
      );
    };

    const toggleLocalModelsDropdown = () => {
      setIsLocalModelsExpanded(!isLocalModelsExpanded);
    };

    const renderContext: RenderContext = {
      themeColors,
      currentTheme,
      selectedModelPath,
      isGenerating: isGenerating || false,
      handleModelSelect,
      expandedGroups,
      toggleGroup,
      onlineModelStatuses,
      enableRemoteModels,
      isLoggedIn,
      isOnlineModelsExpanded,
      toggleOnlineModelsDropdown,
      hasAnyApiKey,
      isLocalModelsExpanded,
      toggleLocalModelsDropdown,
      refreshStoredModels,
      isRefreshingLocalModels
    };

    useEffect(() => {
      if (isOpen !== undefined) {
        setModalVisible(isOpen);
      }
    }, [isOpen]);

    useEffect(() => {
      if (modalVisible) {
        refreshAppleFoundationState();
        loadRemoteNames();
        setOverlayActive(true);
        slideAnim.setValue(getScreenH());
        backdropAnim.setValue(0);
        Animated.parallel([
          Animated.timing(backdropAnim, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(slideAnim, {
            toValue: 0,
            damping: 500,
            stiffness: 1000,
            mass: 3,
            overshootClamping: true,
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        backdropAnim.setValue(1);
        Animated.timing(slideAnim, {
          toValue: getScreenH(),
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            backdropAnim.setValue(0);
            setOverlayActive(false);
          }
        });
      }
    }, [modalVisible]);

    const handleModalClose = () => {
      setModalVisible(false);
      onClose?.();
    };

    useEffect(() => {
      if (preselectedModelPath && models.length > 0) {
        if (handledPreselectedPathRef.current === preselectedModelPath) {
          return;
        }
        const preselectedModel = models.find(model => model.path === preselectedModelPath);
        if (preselectedModel) {
          handledPreselectedPathRef.current = preselectedModelPath;
          handleModelSelect(preselectedModel);
        }
      }
    }, [preselectedModelPath, models]);

    useEffect(() => {
      if (!preselectedModelPath) {
        handledPreselectedPathRef.current = null;
      }
    }, [preselectedModelPath]);


    useEffect(() => {
      if (isGenerating && modalVisible) {
        setModalVisible(false);
      }
    }, [isGenerating]);

    useEffect(() => {
      const unsubscribe = onlineModelService.addListener('api-key-updated', () => {
        checkOnlineModelApiKeys();
        loadCloneModels();
        loadRemoteNames();
      });
      
      return () => {
        unsubscribe();
      };
    }, []);

    useEffect(() => {
      if (!modalVisible || Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleModalClose();
        return true;
      });
      return () => sub.remove();
    }, [modalVisible]);

    const badgeConfig = getConnectionBadgeConfig(selectedModelPath, currentTheme);
    const initBadgeBg = currentTheme === 'dark' ? 'rgba(192,96,224,0.4)' : 'rgba(74,6,96,0.1)';
    const initBadgeColor = getThemeAwareColor('#4a0660', currentTheme);
    const initDividerBg = currentTheme === 'dark' ? 'rgba(192,96,224,0.3)' : 'rgba(74,6,96,0.1)';

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
                'Cannot change model while generating a response. Please wait for the current generation to complete or cancel it.'
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
                    : getModelNameFromPath(selectedModelPath, models, cloneModels, remoteNames)
                  }
                </Text>
                {selectedModelPath && !isModelLoading && (
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
            {showLoadProjector && (
              <TouchableOpacity
                onPress={handleLoadProjector}
                style={styles.unloadButton}
              >
                <MaterialCommunityIcons
                  name="eye-plus"
                  size={16}
                  color={currentTheme === 'dark' ? '#5FD584' : '#2a8c42'}
                />
              </TouchableOpacity>
            )}
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

        {(overlayActive || dialogVisible || projectorSelectorVisible) && (
        <Portal>
          {overlayActive && (
          <View
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            pointerEvents="auto"
          >
            <Animated.View
              style={[styles.modalOverlay, { opacity: backdropAnim }]}
              pointerEvents="box-none"
            >
              <Animated.View
                style={[styles.modalContent, { backgroundColor: themeColors.background, transform: [{ translateY: slideAnim }] }]}
              >
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
                keyExtractor={(item) => (
                  'isMLXGroup' in item && (item as MLXGroup).isMLXGroup
                    ? (item as MLXGroup).groupKey
                    : 'path' in item
                      ? item.path
                      : item.id
                )}
                renderItem={({ item, section }) => renderItem(item, section, renderContext)}
                renderSectionHeader={({ section }) => renderSectionHeader(section, renderContext)}
                contentContainerStyle={styles.modelList}
                stickySectionHeadersEnabled={true}
                ListHeaderComponent={
                  <View>
                    <View style={[styles.initPanel, { backgroundColor: currentTheme === 'dark' ? 'rgba(192,96,224,0.12)' : 'rgba(74,6,96,0.03)', borderColor: currentTheme === 'dark' ? 'rgba(192,96,224,0.3)' : 'rgba(74,6,96,0.12)' }]}>
                      <TouchableOpacity
                        style={styles.initPanelToggle}
                        onPress={() => setShowInitPanel(v => !v)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.initPanelToggleLabelRow}>
                          <MaterialCommunityIcons
                            name="tune"
                            size={16}
                            color={getThemeAwareColor('#4a0660', currentTheme)}
                          />
                          <Text style={[styles.initPanelToggleLabel, { color: currentTheme === 'dark' ? '#fff' : themeColors.text }]}>Runtime Settings</Text>
                        </View>
                        <View style={styles.initPanelActions}>
                          {showInitPanel && (
                            <TouchableOpacity
                              style={styles.initResetIconButton}
                              onPress={(event) => {
                                event.stopPropagation();
                                resetInitOverrides();
                              }}
                              activeOpacity={0.7}
                            >
                              <MaterialCommunityIcons
                                name="restore"
                                size={15}
                                color={getThemeAwareColor('#4a0660', currentTheme)}
                              />
                            </TouchableOpacity>
                          )}
                          <MaterialCommunityIcons
                            name={showInitPanel ? 'chevron-up' : 'chevron-down'}
                            size={20}
                            color={currentTheme === 'dark' ? '#fff' : themeColors.text}
                          />
                        </View>
                      </TouchableOpacity>

                      <View style={showInitPanel ? undefined : { height: 0, overflow: 'hidden' }}>
                        <View style={styles.initExpandedContent}>
                          <View style={[styles.initDivider, { backgroundColor: initDividerBg }]} />

                          <View style={[styles.initWarningRow, { backgroundColor: currentTheme === 'dark' ? 'rgba(255,176,0,0.1)' : 'rgba(255,152,0,0.08)', borderColor: currentTheme === 'dark' ? 'rgba(255,176,0,0.25)' : 'rgba(255,152,0,0.3)' }]}>
                            <MaterialCommunityIcons name="information-outline" size={14} color={currentTheme === 'dark' ? '#FFB300' : '#E65100'} />
                            <Text style={[styles.initWarningText, { color: currentTheme === 'dark' ? '#FFB300' : '#E65100' }]}>Only applies to the llama.cpp engine</Text>
                          </View>

                          <View style={styles.initSliderItem}>
                            <View style={styles.initSliderHeader}>
                              <View style={styles.initSliderLabelGroup}>
                                <Text style={{ fontWeight: '600', color: currentTheme === 'dark' ? '#fff' : themeColors.text }}>Context Window</Text>
                                <Text style={[styles.initSliderDesc, { color: currentTheme === 'dark' ? '#ccc' : themeColors.secondaryText }]}>Max tokens the model remembers</Text>
                              </View>
                              <View style={[styles.initValueBadge, { backgroundColor: initBadgeBg }]}>
                                <Text style={[styles.initValueBadgeText, { color: initBadgeColor }]}>{initOverrides.n_ctx}</Text>
                              </View>
                            </View>
                            <Slider
                              minimumValue={512}
                              maximumValue={16384}
                              step={256}
                              value={initOverrides.n_ctx}
                              onValueChange={(value) => applyInitOverride('n_ctx', value)}
                              minimumTrackTintColor={getThemeAwareColor('#4a0660', currentTheme)}
                              thumbTintColor={getThemeAwareColor('#4a0660', currentTheme)}
                            />
                          </View>

                          <View style={styles.initSliderItem}>
                            <View style={styles.initSliderHeader}>
                              <View style={styles.initSliderLabelGroup}>
                                <Text style={{ fontWeight: '600', color: currentTheme === 'dark' ? '#fff' : themeColors.text }}>Batch Size</Text>
                                <Text style={[styles.initSliderDesc, { color: currentTheme === 'dark' ? '#ccc' : themeColors.secondaryText }]}>Tokens processed per step</Text>
                              </View>
                              <View style={[styles.initValueBadge, { backgroundColor: initBadgeBg }]}>
                                <Text style={[styles.initValueBadgeText, { color: initBadgeColor }]}>{initOverrides.n_batch}</Text>
                              </View>
                            </View>
                            <Slider
                              minimumValue={16}
                              maximumValue={2048}
                              step={16}
                              value={initOverrides.n_batch}
                              onValueChange={(value) => applyInitOverride('n_batch', value)}
                              minimumTrackTintColor={getThemeAwareColor('#4a0660', currentTheme)}
                              thumbTintColor={getThemeAwareColor('#4a0660', currentTheme)}
                            />
                          </View>

                          <View style={styles.initSliderItem}>
                            <View style={styles.initSliderHeader}>
                              <View style={styles.initSliderLabelGroup}>
                                <Text style={{ fontWeight: '600', color: currentTheme === 'dark' ? '#fff' : themeColors.text }}>Parallel Sequences</Text>
                                <Text style={[styles.initSliderDesc, { color: currentTheme === 'dark' ? '#ccc' : themeColors.secondaryText }]}>Concurrent inference streams</Text>
                              </View>
                              <View style={[styles.initValueBadge, { backgroundColor: initBadgeBg }]}>
                                <Text style={[styles.initValueBadgeText, { color: initBadgeColor }]}>{initOverrides.n_parallel}</Text>
                              </View>
                            </View>
                            <Slider
                              minimumValue={1}
                              maximumValue={8}
                              step={1}
                              value={initOverrides.n_parallel}
                              onValueChange={(value) => applyInitOverride('n_parallel', value)}
                              minimumTrackTintColor={getThemeAwareColor('#4a0660', currentTheme)}
                              thumbTintColor={getThemeAwareColor('#4a0660', currentTheme)}
                            />
                          </View>

                          <View style={styles.initSliderItem}>
                            <View style={styles.initSliderHeader}>
                              <View style={styles.initSliderLabelGroup}>
                                <Text style={{ fontWeight: '600', color: currentTheme === 'dark' ? '#fff' : themeColors.text }}>CPU Threads</Text>
                                <Text style={[styles.initSliderDesc, { color: currentTheme === 'dark' ? '#ccc' : themeColors.secondaryText }]}>Thread count for computation</Text>
                              </View>
                              <View style={[styles.initValueBadge, { backgroundColor: initBadgeBg }]}>
                                <Text style={[styles.initValueBadgeText, { color: initBadgeColor }]}>{initOverrides.n_threads}</Text>
                              </View>
                            </View>
                            <Slider
                              minimumValue={1}
                              maximumValue={16}
                              step={1}
                              value={initOverrides.n_threads}
                              onValueChange={(value) => applyInitOverride('n_threads', value)}
                              minimumTrackTintColor={getThemeAwareColor('#4a0660', currentTheme)}
                              thumbTintColor={getThemeAwareColor('#4a0660', currentTheme)}
                            />
                          </View>

                          <View style={[styles.initSliderItem, { marginBottom: 0 }]}>
                            <View style={styles.initSliderHeader}>
                              <View style={styles.initSliderLabelGroup}>
                                <Text style={{ fontWeight: '600', color: currentTheme === 'dark' ? '#fff' : themeColors.text }}>GPU Offload Layers</Text>
                                <Text style={[styles.initSliderDesc, { color: currentTheme === 'dark' ? '#ccc' : themeColors.secondaryText }]}>Layers offloaded to GPU</Text>
                              </View>
                              <View style={[styles.initValueBadge, { backgroundColor: initBadgeBg }]}>
                                <Text style={[styles.initValueBadgeText, { color: initBadgeColor }]}>{initOverrides.n_gpu_layers}</Text>
                              </View>
                            </View>
                            <Slider
                              minimumValue={0}
                              maximumValue={200}
                              step={1}
                              value={initOverrides.n_gpu_layers}
                              onValueChange={(value) => applyInitOverride('n_gpu_layers', value)}
                              minimumTrackTintColor={getThemeAwareColor('#4a0660', currentTheme)}
                              thumbTintColor={getThemeAwareColor('#4a0660', currentTheme)}
                            />
                          </View>
                        </View>
                      </View>
                    </View>

                    {isLoadingLocalModels ? (
                      <View style={styles.emptyContainer}>
                        <ActivityIndicator size="large" color={getThemeAwareColor('#4a0660', currentTheme)} />
                        <Text style={[styles.emptyText, { color: currentTheme === 'dark' ? '#fff' : themeColors.text, marginTop: 16 }]}>
                          Loading models...
                        </Text>
                      </View>
                    ) : models.length === 0 ? (
                      <View style={styles.emptyContainer}>
                        <MaterialCommunityIcons name="cube-outline" size={48} color={currentTheme === 'dark' ? '#fff' : themeColors.secondaryText} />
                        <Text style={[styles.emptyText, { color: currentTheme === 'dark' ? '#fff' : themeColors.text }]}>
                          No local models found. Download from Models tab.
                        </Text>
                      </View>
                    ) : sections[0]?.data?.length === 0 ? (
                      <View style={styles.emptyContainer}>
                        <MaterialCommunityIcons 
                          name="cube-outline" 
                          size={48} 
                          color={currentTheme === 'dark' ? '#fff' : themeColors.secondaryText} 
                        />
                        <Text style={[styles.emptyText, { color: currentTheme === 'dark' ? '#fff' : themeColors.text }]}>
                          No local models found.{'\n'}
                          Download GGUF, LiteRT, or MLX models from the Models tab.
                        </Text>
                      </View>
                    ) : null}
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
              </Animated.View>
            </Animated.View>
          </View>
          )}

          {dialogVisible && (
          <Dialog
            visible={dialogVisible}
            onDismiss={hideDialog}
            title={dialogTitle}
            description={dialogMessage}
            primaryButtonText={dialogPrimaryText}
            onPrimaryPress={dialogPrimaryPress}
            secondaryButtonText={dialogSecondaryText}
            onSecondaryPress={dialogSecondaryPress}
          />
          )}

          {projectorSelectorVisible && (
          <Dialog
            visible={projectorSelectorVisible}
            onDismiss={handleProjectorSelectorClose}
            title="Select Multimodal Projector"
            primaryButtonText="Skip"
            onPrimaryPress={handleProjectorSkip}
            secondaryButtonText="Cancel"
            onSecondaryPress={handleProjectorSelectorClose}
          >
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
          </Dialog>
          )}
        </Portal>
        )}
      </>
    );
  }
);

export default ModelSelector;
