import * as FileSystem from 'expo-file-system';
import { llamaManager } from '../../../utils/LlamaManager';
import { modelDownloader } from '../../ModelDownloader';
import type { StoredModel } from '../../ModelDownloaderTypes';
import { logger } from '../../../utils/logger';

type Context = {
  respond: (socket: any, status: number, payload: any) => void;
  findStoredModel: (identifier: string, models: StoredModel[]) => StoredModel | null;
  getFileSize: (path: string | null) => Promise<number>;
  activeModel: { path: string; name: string; startedAt: string } | null;
};

export function createPsHandler(context: Context) {
  return async (method: string, path: string, socket: any): Promise<boolean> => {
    if (method !== 'GET' || path !== '/api/ps') {
      return false;
    }

    try {
      const items: any[] = [];

      if (llamaManager.isInitialized()) {
        const currentPath = llamaManager.getModelPath();
        const models = await modelDownloader.getStoredModels();
        const target = currentPath ? context.findStoredModel(currentPath, models) : null;
        const name = target?.name || context.activeModel?.name || (currentPath ? currentPath.split('/').pop() || 'model' : 'model');
        const size = target?.size || await context.getFileSize(currentPath);
        const started = context.activeModel?.startedAt || new Date().toISOString();

        items.push({
          name,
          model: target?.path || currentPath,
          size,
          is_external: target?.isExternal === true,
          model_type: target?.modelType || null,
          loaded_at: started
        });
      }

      context.respond(socket, 200, { models: items });
      logger.logWebRequest(method, path, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ps_failed';
      const safeMessage = message.replace(/\s+/g, '_');
      logger.error(`api_ps_failed:${safeMessage}`, 'webrtc');
      context.respond(socket, 500, { error: 'ps_failed' });
      logger.logWebRequest(method, path, 500);
    }
    return true;
  };
}

export function createCopyHandler(context: Context) {
  return async (method: string, path: string, body: string, socket: any): Promise<boolean> => {
    if (method !== 'POST' || path !== '/api/copy') {
      return false;
    }

    if (!body) {
      context.respond(socket, 400, { error: 'empty_body' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      context.respond(socket, 400, { error: 'invalid_json' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    const sourceIdentifier = typeof payload?.source === 'string' && payload.source.length > 0
      ? payload.source
      : typeof payload?.name === 'string' && payload.name.length > 0
        ? payload.name
        : typeof payload?.model === 'string' && payload.model.length > 0
          ? payload.model
          : null;

    const destinationName = typeof payload?.destination === 'string' && payload.destination.length > 0
      ? payload.destination
      : typeof payload?.target === 'string' && payload.target.length > 0
        ? payload.target
        : null;

    if (!sourceIdentifier || !destinationName) {
      context.respond(socket, 400, { error: 'missing_parameters' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    if (destinationName.includes('/') || destinationName.includes('..')) {
      context.respond(socket, 400, { error: 'invalid_destination' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    try {
      const models = await modelDownloader.getStoredModels();
      const source = context.findStoredModel(sourceIdentifier, models);

      if (!source) {
        context.respond(socket, 404, { error: 'model_not_found' });
        logger.logWebRequest(method, path, 404);
        return true;
      }

      if (source.isExternal) {
        context.respond(socket, 400, { error: 'unsupported_source' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      const slashIndex = source.path.lastIndexOf('/');
      const destDir = slashIndex === -1 ? '' : source.path.slice(0, slashIndex);
      const destPath = destDir.length > 0 ? `${destDir}/${destinationName}` : destinationName;

      const existing = await FileSystem.getInfoAsync(destPath);
      if (existing.exists) {
        context.respond(socket, 409, { error: 'destination_exists' });
        logger.logWebRequest(method, path, 409);
        return true;
      }

      await FileSystem.copyAsync({ from: source.path, to: destPath });
      await modelDownloader.refreshStoredModels();

      context.respond(socket, 200, {
        status: 'copied',
        source: source.name,
        destination: destinationName
      });
      logger.logWebRequest(method, path, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'copy_failed';
      const safeMessage = message.replace(/\s+/g, '_');
      logger.error(`api_copy_failed:${safeMessage}`, 'webrtc');
      context.respond(socket, 500, { error: 'copy_failed' });
      logger.logWebRequest(method, path, 500);
    }
    return true;
  };
}

export function createTagsHandler(context: Context) {
  return async (method: string, path: string, socket: any): Promise<boolean> => {
    if (method !== 'GET' || path !== '/api/tags') {
      return false;
    }

    try {
      const models = await modelDownloader.getStoredModels();
      const items = models.map(model => ({
        name: model.name,
        modified_at: model.modified,
        size: model.size,
        digest: null,
        model_type: model.modelType,
        is_external: model.isExternal === true
      }));
      context.respond(socket, 200, { models: items });
      logger.logWebRequest(method, path, 200);
    } catch (error) {
      context.respond(socket, 500, { error: 'models_unavailable' });
      logger.logWebRequest(method, path, 500);
    }
    return true;
  };
}

export function createPullHandler(context: Context) {
  return async (method: string, path: string, body: string, socket: any): Promise<boolean> => {
    if (method !== 'POST' || path !== '/api/pull') {
      return false;
    }

    if (!body) {
      context.respond(socket, 400, { error: 'empty_body' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      context.respond(socket, 400, { error: 'invalid_json' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    const url = typeof payload.url === 'string' && payload.url.length > 0 ? payload.url : null;
    const modelName = typeof payload.model === 'string' && payload.model.length > 0 ? payload.model : typeof payload.name === 'string' ? payload.name : null;

    if (!url || !modelName) {
      context.respond(socket, 400, { error: 'missing_parameters' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      context.respond(socket, 400, { error: 'unsupported_url' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    try {
      const result = await modelDownloader.downloadModel(url, modelName);
      context.respond(socket, 200, {
        status: 'downloading',
        model: modelName,
        downloadId: result.downloadId
      });
      logger.logWebRequest(method, path, 200);
    } catch (error) {
      context.respond(socket, 500, { error: 'download_failed' });
      logger.logWebRequest(method, path, 500);
    }
    return true;
  };
}

export function createDeleteHandler(context: Context) {
  return async (method: string, path: string, body: string, socket: any): Promise<boolean> => {
    if (method !== 'DELETE' || path !== '/api/delete') {
      return false;
    }

    if (!body) {
      context.respond(socket, 400, { error: 'empty_body' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      context.respond(socket, 400, { error: 'invalid_json' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    const targetPath = typeof payload.path === 'string' && payload.path.length > 0 ? payload.path : null;
    const targetName = typeof payload.name === 'string' && payload.name.length > 0 ? payload.name : null;

    if (!targetPath && !targetName) {
      context.respond(socket, 400, { error: 'missing_parameters' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    try {
      const models = await modelDownloader.getStoredModels();
      let target = null;

      if (targetPath) {
        target = models.find(model => model.path === targetPath) || null;
      }

      if (!target && targetName) {
        target = models.find(model => model.name === targetName) || null;
      }

      if (!target) {
        context.respond(socket, 404, { error: 'model_not_found' });
        logger.logWebRequest(method, path, 404);
        return true;
      }

      await modelDownloader.deleteModel(target.path);
      context.respond(socket, 200, { status: 'deleted', name: target.name });
      logger.logWebRequest(method, path, 200);
    } catch (error) {
      context.respond(socket, 500, { error: 'delete_failed' });
      logger.logWebRequest(method, path, 500);
    }
    return true;
  };
}
