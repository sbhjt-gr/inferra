import { loadLlamaModelInfo } from 'llama.rn';
import { modelDownloader } from '../../ModelDownloader';
import { modelSettingsService } from '../../ModelSettingsService';
import type { StoredModel } from '../../ModelDownloaderTypes';
import { logger } from '../../../utils/logger';

type Context = {
  respond: (socket: any, status: number, payload: any) => void;
  findStoredModel: (identifier: string, models: StoredModel[]) => StoredModel | null;
};

export function createShowHandler(context: Context) {
  return async (method: string, path: string, body: string, socket: any): Promise<boolean> => {
    if (method !== 'POST' || path !== '/api/show') {
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

    const identifier = typeof payload?.name === 'string' && payload.name.length > 0
      ? payload.name
      : typeof payload?.model === 'string' && payload.model.length > 0
        ? payload.model
        : typeof payload?.path === 'string' && payload.path.length > 0
          ? payload.path
          : null;

    if (!identifier) {
      context.respond(socket, 400, { error: 'model_required' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    try {
      const models = await modelDownloader.getStoredModels();
      const target = context.findStoredModel(identifier, models);

      if (!target) {
        context.respond(socket, 404, { error: 'model_not_found' });
        logger.logWebRequest(method, path, 404);
        return true;
      }

      let info: any = {};
      try {
        info = await loadLlamaModelInfo(target.path);
      } catch (error) {
        info = {};
      }

      const settingsConfig = await modelSettingsService.getModelSettings(target.path);

      context.respond(socket, 200, {
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
      context.respond(socket, 500, { error: 'model_info_failed' });
      logger.logWebRequest(method, path, 500);
    }
    return true;
  };
}
