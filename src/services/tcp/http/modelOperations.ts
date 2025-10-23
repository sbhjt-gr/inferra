import { modelDownloader } from '../../ModelDownloader';
import { logger } from '../../../utils/logger';
import type { StoredModel } from '../../ModelDownloaderTypes';
import { parseJsonBody } from './jsonParser';
import * as FileSystem from 'expo-file-system';

export async function handleCopyRequest(
  body: string,
  socket: any,
  method: string,
  path: string,
  findStoredModel: (identifier: string, models: StoredModel[]) => StoredModel | null,
  sendJSONResponse: (socket: any, status: number, payload: any) => void
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body);
  if (parseError) {
    sendJSONResponse(socket, 400, { error: parseError });
    logger.logWebRequest(method, path, 400);
    return;
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
    sendJSONResponse(socket, 400, { error: 'missing_parameters' });
    logger.logWebRequest(method, path, 400);
    return;
  }

  if (destinationName.includes('/') || destinationName.includes('..')) {
    sendJSONResponse(socket, 400, { error: 'invalid_destination' });
    logger.logWebRequest(method, path, 400);
    return;
  }

  try {
    const models = await modelDownloader.getStoredModels();
    const source = findStoredModel(sourceIdentifier, models);

    if (!source) {
      sendJSONResponse(socket, 404, { error: 'model_not_found' });
      logger.logWebRequest(method, path, 404);
      return;
    }

    if (source.isExternal) {
      sendJSONResponse(socket, 400, { error: 'unsupported_source' });
      logger.logWebRequest(method, path, 400);
      return;
    }

    const slashIndex = source.path.lastIndexOf('/');
    const destDir = slashIndex === -1 ? '' : source.path.slice(0, slashIndex);
    const destPath = destDir.length > 0 ? `${destDir}/${destinationName}` : destinationName;

    const existing = await FileSystem.getInfoAsync(destPath);
    if (existing.exists) {
      sendJSONResponse(socket, 409, { error: 'destination_exists' });
      logger.logWebRequest(method, path, 409);
      return;
    }

    await FileSystem.copyAsync({ from: source.path, to: destPath });
    await modelDownloader.refreshStoredModels();

    sendJSONResponse(socket, 200, {
      status: 'copied',
      source: source.name,
      destination: destinationName
    });
    logger.logWebRequest(method, path, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'copy_failed';
    const safeMessage = message.replace(/\s+/g, '_');
    logger.error(`api_copy_failed:${safeMessage}`, 'webrtc');
    sendJSONResponse(socket, 500, { error: 'copy_failed' });
    logger.logWebRequest(method, path, 500);
  }
}

export async function handleTagsRequest(
  socket: any,
  method: string,
  path: string,
  sendJSONResponse: (socket: any, status: number, payload: any) => void
): Promise<void> {
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
    sendJSONResponse(socket, 200, { models: items });
    logger.logWebRequest(method, path, 200);
  } catch (error) {
    sendJSONResponse(socket, 500, { error: 'models_unavailable' });
    logger.logWebRequest(method, path, 500);
  }
}

export async function handlePullRequest(
  body: string,
  socket: any,
  method: string,
  path: string,
  sendJSONResponse: (socket: any, status: number, payload: any) => void
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body);
  if (parseError) {
    sendJSONResponse(socket, 400, { error: parseError });
    logger.logWebRequest(method, path, 400);
    return;
  }

  const url = typeof payload.url === 'string' && payload.url.length > 0 ? payload.url : null;
  const modelName = typeof payload.model === 'string' && payload.model.length > 0 ? payload.model : typeof payload.name === 'string' ? payload.name : null;

  if (!url || !modelName) {
    sendJSONResponse(socket, 400, { error: 'missing_parameters' });
    logger.logWebRequest(method, path, 400);
    return;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    sendJSONResponse(socket, 400, { error: 'unsupported_url' });
    logger.logWebRequest(method, path, 400);
    return;
  }

  try {
    const result = await modelDownloader.downloadModel(url, modelName);
    sendJSONResponse(socket, 200, {
      status: 'downloading',
      model: modelName,
      downloadId: result.downloadId
    });
    logger.logWebRequest(method, path, 200);
  } catch (error) {
    sendJSONResponse(socket, 500, { error: 'download_failed' });
    logger.logWebRequest(method, path, 500);
  }
}

export async function handleDeleteRequest(
  body: string,
  socket: any,
  method: string,
  path: string,
  sendJSONResponse: (socket: any, status: number, payload: any) => void
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body);
  if (parseError) {
    sendJSONResponse(socket, 400, { error: parseError });
    logger.logWebRequest(method, path, 400);
    return;
  }

  const targetPath = typeof payload.path === 'string' && payload.path.length > 0 ? payload.path : null;
  const targetName = typeof payload.name === 'string' && payload.name.length > 0 ? payload.name : null;

  if (!targetPath && !targetName) {
    sendJSONResponse(socket, 400, { error: 'missing_parameters' });
    logger.logWebRequest(method, path, 400);
    return;
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
      sendJSONResponse(socket, 404, { error: 'model_not_found' });
      logger.logWebRequest(method, path, 404);
      return;
    }

    await modelDownloader.deleteModel(target.path);
    sendJSONResponse(socket, 200, { success: true });
    logger.logWebRequest(method, path, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'delete_failed';
    const safeMessage = message.replace(/\s+/g, '_');
    logger.error(`api_delete_failed:${safeMessage}`, 'webrtc');
    sendJSONResponse(socket, 500, { error: 'delete_failed' });
    logger.logWebRequest(method, path, 500);
  }
}

export async function handlePsRequest(
  socket: any,
  method: string,
  path: string,
  sendJSONResponse: (socket: any, status: number, payload: any) => void,
  llamaManagerIsInitialized: () => boolean,
  llamaManagerGetModelPath: () => string | null,
  findStoredModel: (identifier: string, models: StoredModel[]) => StoredModel | null,
  getFileSize: (path: string | null) => Promise<number>,
  getActiveModel: () => { path: string; name: string; startedAt: string } | null
): Promise<void> {
  try {
    const items: any[] = [];

    if (llamaManagerIsInitialized()) {
      const currentPath = llamaManagerGetModelPath();
      const models = await modelDownloader.getStoredModels();
      const target = currentPath ? findStoredModel(currentPath, models) : null;
      const activeModel = getActiveModel();
      const name = target?.name || activeModel?.name || (currentPath ? currentPath.split('/').pop() || 'model' : 'model');
      const size = target?.size || await getFileSize(currentPath);
      const started = activeModel?.startedAt || new Date().toISOString();

      items.push({
        name,
        model: target?.path || currentPath,
        size,
        is_external: target?.isExternal === true,
        model_type: target?.modelType || null,
        loaded_at: started
      });
    }

    sendJSONResponse(socket, 200, { models: items });
    logger.logWebRequest(method, path, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ps_failed';
    const safeMessage = message.replace(/\s+/g, '_');
    logger.error(`api_ps_failed:${safeMessage}`, 'webrtc');
    sendJSONResponse(socket, 500, { error: 'ps_failed' });
    logger.logWebRequest(method, path, 500);
  }
}
