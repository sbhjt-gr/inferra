import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ProviderType } from '../services/ModelManagementService';
import { OnlineModelService } from '../services/OnlineModelService';
import { StoredModel, MLXGroup, OnlineModel } from './ModelSelector.types';

export const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B ', 'KB ', 'MB ', 'GB '];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

export const getDisplayName = (filename: string) => {
  return filename.replace(/\.(gguf|bin|litertlm|task)$/i, '');
};

export const getModelNameFromPath = (path: string | null, models: StoredModel[], cloneModels: OnlineModel[] = [], remoteNames: Record<string, string> = {}): string => {
  if (!path) return 'Select a Model';

  const cloneModel = cloneModels.find(model => model.id === path);
  if (cloneModel) {
    return cloneModel.name;
  }
  
  if (path === 'gemini') return remoteNames['gemini'] || 'Gemini';
  if (path === 'chatgpt') return remoteNames['chatgpt'] || 'ChatGPT';
  if (path === 'claude') return remoteNames['claude'] || 'Claude';
  if (path === 'apple-foundation') return 'Apple Foundation';

  if (OnlineModelService.isClone(path)) {
    const baseProvider = OnlineModelService.getBaseProvider(path);
    if (baseProvider === 'gemini') return 'Gemini Clone';
    if (baseProvider === 'chatgpt') return 'ChatGPT Clone';
    if (baseProvider === 'claude') return 'Claude Clone';
  }
  
  const model = models.find(m => m.path === path);
  return model ? getDisplayName(model.name) : getDisplayName(path.split('/').pop() || '');
};

export const getProjectorNameFromPath = (path: string | null, models: StoredModel[]): string => {
  if (!path) return '';
  
  const model = models.find(m => m.path === path);
  return model ? getDisplayName(model.name) : getDisplayName(path.split('/').pop() || '');
};

const remoteProviders = new Set<ProviderType>(['gemini', 'chatgpt', 'claude']);

const isRemoteProvider = (provider: string | null): boolean => {
  if (!provider) return false;
  const baseProvider = OnlineModelService.getBaseProvider(provider);
  return remoteProviders.has(baseProvider as ProviderType);
};

const isAppleProvider = (provider: string | null): boolean => provider === 'apple-foundation';

export const getActiveModelIcon = (provider: string | null): keyof typeof MaterialCommunityIcons.glyphMap => {
  if (!provider) return 'cube-outline';
  if (isAppleProvider(provider)) return 'apple';
  if (isRemoteProvider(provider)) return 'cloud';
  return 'cube';
};

export const getConnectionBadgeConfig = (provider: string | null, currentTheme: 'light' | 'dark') => {
  if (isRemoteProvider(provider)) {
    return {
      backgroundColor: 'rgba(74, 180, 96, 0.15)',
      textColor: '#2a8c42',
      label: 'REMOTE'
    };
  }
  if (isAppleProvider(provider)) {
    return {
      backgroundColor: 'rgba(74, 6, 96, 0.1)',
      textColor: currentTheme === 'dark' ? '#fff' : '#660880',
      label: 'APPLE'
    };
  }
  return {
    backgroundColor: 'rgba(74, 6, 96, 0.1)',
    textColor: currentTheme === 'dark' ? '#fff' : '#660880',
    label: 'LOCAL'
  };
};

export const isLiteRTModel = (model: StoredModel): boolean => {
  if (model.modelFormat === 'litert') return true;
  if (model.modelFormat === 'mlx' || model.modelFormat === 'gguf') return false;

  const path = model.path.toLowerCase();
  const name = model.name.toLowerCase();

  return (
    name.endsWith('.litertlm') ||
    path.endsWith('.litertlm') ||
    name.endsWith('.task') ||
    path.endsWith('.task')
  );
};

export const isMLXModel = (model: StoredModel): boolean => {
  if (model.modelFormat === 'mlx') return true;
  if (model.modelFormat === 'gguf') return false;
  if (model.modelFormat === 'litert') return false;

  const path = model.path.toLowerCase();
  const name = model.name.toLowerCase();

  if (model.isDirectory) return true;

  if (path.includes('/huggingface/models/') || path.includes('mlx-community')) {
    return true;
  }

  if (name.endsWith('.safetensors') || path.endsWith('.safetensors')) {
    return true;
  }

  if ((name.includes('mlx') || path.includes('mlx')) &&
      (name.endsWith('.json') || path.endsWith('.json'))) {
    return true;
  }

  return false;
};

export const groupMLXModels = (items: StoredModel[]): (StoredModel | MLXGroup)[] => {
  const groups: { [key: string]: StoredModel[] } = {};
  const others: StoredModel[] = [];

  items.forEach(model => {
    const dirPath = model.isDirectory ? model.path : model.path.substring(0, model.path.lastIndexOf('/'));
    const dirName = dirPath.split('/').pop() || '';

    if (dirName) {
      if (!groups[dirPath]) {
        groups[dirPath] = [];
      }
      groups[dirPath].push(model);
    } else {
      others.push(model);
    }
  });

  const grouped: (StoredModel | MLXGroup)[] = [];

  Object.entries(groups).forEach(([dirPath, files]) => {
    if (files.length === 1) {
      grouped.push(files[0]);
      return;
    }

    const size = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const first = files[0];
    const dirName = dirPath.split('/').pop() || '';
    
    const commonPrefix = files[0].name.split('_').slice(0, -1).join('_');
    const displayName = commonPrefix || dirName;
    const modelId = commonPrefix.replace(/_/g, '/');

    console.log('mlx_group_created', {
      dirPath,
      dirName,
      firstFilePath: first.path,
      filesCount: files.length,
      fileNames: files.map(f => f.name),
      commonPrefix,
      modelId
    });

    grouped.push({
      ...first,
      name: displayName,
      size,
      path: modelId,
      isMLXGroup: true,
      mlxFiles: files,
      groupKey: dirPath,
    });
  });

  return [...grouped, ...others];
};
