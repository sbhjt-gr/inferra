import { modelDownloader } from '../../ModelDownloader';
import { llamaManager } from '../../../utils/LlamaManager';
import { logger } from '../../../utils/logger';
import type { StoredModel } from '../../ModelDownloaderTypes';
import { parseJsonBody } from './jsonParser';
import { loadLlamaModelInfo } from 'llama.rn';
import { modelSettingsService } from '../../ModelSettingsService';

export async function handleShowRequest(
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

  const identifier = typeof payload?.name === 'string' && payload.name.length > 0
    ? payload.name
    : typeof payload?.model === 'string' && payload.model.length > 0
      ? payload.model
      : typeof payload?.path === 'string' && payload.path.length > 0
        ? payload.path
        : null;

  if (!identifier) {
    sendJSONResponse(socket, 400, { error: 'model_required' });
    logger.logWebRequest(method, path, 400);
    return;
  }

  try {
    const models = await modelDownloader.getStoredModels();
    const target = findStoredModel(identifier, models);

    if (!target) {
      sendJSONResponse(socket, 404, { error: 'model_not_found' });
      logger.logWebRequest(method, path, 404);
      return;
    }

    let info: any = {};
    try {
      info = await loadLlamaModelInfo(target.path);
    } catch (error) {
      info = {};
    }

    const settingsConfig = await modelSettingsService.getModelSettings(target.path);

    sendJSONResponse(socket, 200, {
      name: target.name,
      path: target.path,
      size: target.size,
      modified_at: target.modified,
      is_external: target.isExternal === true,
      model_type: target.modelType || null,
      capabilities: target.capabilities || [],
      multimodal: target.supportsMultimodal === true,
      default_projection_model: target.defaultProjectionModel || null,
      settings: settingsConfig,
      info
    });
    logger.logWebRequest(method, path, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'model_info_failed';
    const safeMessage = message.replace(/\s+/g, '_');
    logger.error(`api_show_failed:${safeMessage}`, 'webrtc');
    sendJSONResponse(socket, 500, { error: 'model_info_failed' });
    logger.logWebRequest(method, path, 500);
  }
}

export async function handleEmbeddingsRequest(
  body: string,
  socket: any,
  method: string,
  path: string,
  ensureModelLoaded: (identifier?: string) => Promise<{ model: StoredModel; projectorPath?: string }>,
  parseHttpError: (error: unknown) => { status: number; code: string; message: string },
  sendJSONResponse: (socket: any, status: number, payload: any) => void
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body);
  if (parseError) {
    sendJSONResponse(socket, 400, { error: parseError });
    logger.logWebRequest(method, path, 400);
    return;
  }

  const identifier = typeof payload.model === 'string' ? payload.model : undefined;
  const input = payload.input ?? payload.prompt ?? payload.text;

  let inputs: string[] = [];

  if (typeof input === 'string') {
    inputs = [input];
  } else if (Array.isArray(input)) {
    inputs = input.filter((item: any) => typeof item === 'string');
  }

  if (inputs.length === 0) {
    sendJSONResponse(socket, 400, { error: 'input_required' });
    logger.logWebRequest(method, path, 400);
    return;
  }

  let target: { model: StoredModel; projectorPath?: string };

  try {
    target = await ensureModelLoaded(identifier);
  } catch (error) {
    const parsed = parseHttpError(error);
    const safeMessage = parsed.message.replace(/\s+/g, '_');
    logger.error(`api_embeddings_model:${safeMessage}`, 'webrtc');
    sendJSONResponse(socket, parsed.status, { error: parsed.code });
    logger.logWebRequest(method, path, parsed.status);
    return;
  }

  try {
    const vectors: number[][] = [];

    for (const text of inputs) {
      const vector = await llamaManager.generateEmbedding(text);
      vectors.push(vector);
    }

    if (vectors.length === 1) {
      sendJSONResponse(socket, 200, {
        model: target.model.name,
        created_at: new Date().toISOString(),
        embedding: vectors[0]
      });
    } else {
      sendJSONResponse(socket, 200, {
        model: target.model.name,
        created_at: new Date().toISOString(),
        embeddings: vectors
      });
    }
    logger.logWebRequest(method, path, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'embedding_failed';
    const safeMessage = message.replace(/\s+/g, '_');
    logger.error(`api_embeddings_failed:${safeMessage}`, 'webrtc');
    sendJSONResponse(socket, 500, { error: 'embedding_failed' });
    logger.logWebRequest(method, path, 500);
  }
}
