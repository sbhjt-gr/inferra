import { modelDownloader } from '../../ModelDownloader';
import type { StoredModel } from '../../ModelDownloaderTypes';
import { logger } from '../../../utils/logger';

type Context = {
  getSelectedModelOption: () => any;
  getSelectedProvider: () => string;
  resolveProjectorPath: (modelPath: string | null, models: StoredModel[]) => string | null;
};

export async function buildCustomSettings(context: Context): Promise<any> {
  try {
    const selectedModelOption = context.getSelectedModelOption();
    const selectedProvider = context.getSelectedProvider();
    const models = await modelDownloader.getStoredModels();

    const customSettings: any = {
      model: null,
      modelPath: null,
      projectorPath: null,
      isRemote: false,
      provider: null,
      modelType: null,
      isExternal: false
    };

    if (selectedProvider === 'openai' || selectedProvider === 'anthropic' || selectedProvider === 'google') {
      customSettings.isRemote = true;
      customSettings.provider = selectedProvider;
      customSettings.model = selectedProvider === 'openai'
        ? 'gpt-4o-mini'
        : selectedProvider === 'anthropic'
          ? 'claude-3-5-sonnet-20241022'
          : 'gemini-2.0-flash-exp';
      return customSettings;
    }

    if (!selectedModelOption || typeof selectedModelOption !== 'object') {
      return customSettings;
    }

    const isAppleFoundation = selectedModelOption.category === 'apple-foundation';
    if (isAppleFoundation) {
      customSettings.isRemote = true;
      customSettings.provider = 'apple-foundation';
      customSettings.model = selectedModelOption.modelId || selectedModelOption.name || 'apple-foundation';
      return customSettings;
    }

    const hasPath = typeof selectedModelOption.path === 'string' && selectedModelOption.path.length > 0;
    const hasUrl = typeof selectedModelOption.url === 'string' && selectedModelOption.url.length > 0;
    const hasModelId = typeof selectedModelOption.modelId === 'string' && selectedModelOption.modelId.length > 0;
    const isRemoteEntry = selectedModelOption.isRemote === true;

    if (isRemoteEntry && hasModelId) {
      customSettings.isRemote = true;
      customSettings.provider = selectedModelOption.provider || 'unknown';
      customSettings.model = selectedModelOption.modelId;
      return customSettings;
    }

    if (!hasPath && !hasUrl) {
      return customSettings;
    }

    let resolvedPath: string | null = null;
    let targetModel: StoredModel | null = null;

    if (hasPath) {
      resolvedPath = selectedModelOption.path;
      targetModel = models.find(model => model.path === resolvedPath) || null;
    } else if (hasUrl) {
      // URL matching not available in StoredModel type
      targetModel = models.find(model => model.name === selectedModelOption.name) || null;
      resolvedPath = targetModel?.path || null;
    }

    if (!resolvedPath) {
      return customSettings;
    }

    customSettings.modelPath = resolvedPath;
    customSettings.model = targetModel?.name || resolvedPath.split('/').pop() || 'model';
    customSettings.modelType = targetModel?.modelType || null;
    customSettings.isExternal = targetModel?.isExternal === true;

    const projectorPath = context.resolveProjectorPath(resolvedPath, models);
    customSettings.projectorPath = projectorPath;

    return customSettings;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'settings_build_failed';
    logger.error(`build_settings_failed:${message.replace(/\s+/g, '_')}`, 'webrtc');
    return {
      model: null,
      modelPath: null,
      projectorPath: null,
      isRemote: false,
      provider: null,
      modelType: null,
      isExternal: false
    };
  }
}
