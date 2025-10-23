import { llamaManager } from '../../../utils/LlamaManager';
import { logger } from '../../../utils/logger';
import type { StoredModel } from '../../ModelDownloaderTypes';
import type { ApiHandler, JsonResponder } from './apiTypes';

type EnsureModelLoadedResult = {
  model: StoredModel;
  projectorPath?: string;
};

type ParsedHttpError = {
  status: number;
  code: string;
};

type Context = {
  respond: JsonResponder;
  ensureModelLoaded: (identifier?: string) => Promise<EnsureModelLoadedResult>;
  parseHttpError: (error: unknown) => ParsedHttpError;
  appleHandler: ApiHandler;
  remoteHandler: ApiHandler;
};

export function createModelApiHandler(context: Context): ApiHandler {
  return async (method, segments, body, socket, path) => {
    if (segments.length > 0) {
      const target = segments[0];
      if (target === 'apple-foundation') {
        return await context.appleHandler(method, segments.slice(1), body, socket, path);
      }
      if (target === 'remote') {
        return await context.remoteHandler(method, segments.slice(1), body, socket, path);
      }
    }

    if (segments.length === 0 && method === 'POST') {
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

      const action = typeof payload?.action === 'string' ? payload.action : '';
      const identifier = typeof payload?.model === 'string' ? payload.model : undefined;

      if (action === 'load') {
        try {
          const target = await context.ensureModelLoaded(identifier);
          context.respond(socket, 200, {
            status: 'loaded',
            model: {
              name: target.model.name,
              path: target.model.path,
              projector: target.projectorPath ?? null,
            },
          });
          logger.logWebRequest(method, path, 200);
        } catch (error) {
          const parsed = context.parseHttpError(error);
          context.respond(socket, parsed.status, { error: parsed.code });
          logger.logWebRequest(method, path, parsed.status);
        }
        return true;
      }

      if (action === 'unload') {
        try {
          if (llamaManager.isInitialized()) {
            await llamaManager.unloadModel();
          }
          context.respond(socket, 200, { status: 'unloaded' });
          logger.logWebRequest(method, path, 200);
        } catch (error) {
          context.respond(socket, 500, { error: 'model_unload_failed' });
          logger.logWebRequest(method, path, 500);
        }
        return true;
      }

      if (action === 'reload') {
        try {
          const current = llamaManager.getModelPath();
          if (!current) {
            context.respond(socket, 503, { error: 'model_not_loaded' });
            logger.logWebRequest(method, path, 503);
            return true;
          }

          await llamaManager.loadModel(current, llamaManager.getMultimodalProjectorPath() ?? undefined);
          context.respond(socket, 200, { status: 'reloaded', path: current });
          logger.logWebRequest(method, path, 200);
        } catch (error) {
          context.respond(socket, 500, { error: 'model_reload_failed' });
          logger.logWebRequest(method, path, 500);
        }
        return true;
      }

      context.respond(socket, 400, { error: 'invalid_action' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    return false;
  };
}
