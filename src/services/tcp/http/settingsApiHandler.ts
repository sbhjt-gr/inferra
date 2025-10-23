import { llamaManager } from '../../../utils/LlamaManager';
import { logger } from '../../../utils/logger';
import type { ApiHandler, JsonResponder } from './apiTypes';

type Context = {
  respond: JsonResponder;
};

export function createSettingsApiHandler(context: Context): ApiHandler {
  return async (method, segments, body, socket, path) => {
    if (method !== 'POST') {
      return false;
    }

    if (segments[0] === 'thinking') {
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

      const enabled = payload?.enabled;
      if (typeof enabled !== 'boolean') {
        context.respond(socket, 400, { error: 'enabled_required' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      try {
        await llamaManager.setEnableThinking(enabled);
        context.respond(socket, 200, { status: 'updated', enabled });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        context.respond(socket, 500, { error: 'thinking_update_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    return false;
  };
}
