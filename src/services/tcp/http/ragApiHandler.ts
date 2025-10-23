import { RAGService } from '../../rag/RAGService';
import { logger } from '../../../utils/logger';
import type { ApiHandler, JsonResponder } from './apiTypes';
import { normalizeProvider } from './providerUtils';

type Context = {
  respond: JsonResponder;
};

export function createRagApiHandler(context: Context): ApiHandler {
  return async (method, segments, body, socket, path) => {
    if (segments.length === 0) {
      if (method === 'GET') {
        try {
          const enabled = await RAGService.isEnabled();
          const storage = await RAGService.getStorageType();
          context.respond(socket, 200, {
            enabled,
            storage,
            ready: RAGService.isReady(),
          });
          logger.logWebRequest(method, path, 200);
        } catch (error) {
          context.respond(socket, 500, { error: 'rag_status_failed' });
          logger.logWebRequest(method, path, 500);
        }
        return true;
      }

      if (method === 'POST') {
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
        const storage = payload?.storage;
        const provider = normalizeProvider(payload?.provider);

        try {
          if (typeof enabled === 'boolean') {
            await RAGService.setEnabled(enabled);
          }

          if (storage === 'memory' || storage === 'persistent') {
            await RAGService.setStorageType(storage);
          }

          if (payload?.initialize) {
            await RAGService.initialize(provider);
          }

          context.respond(socket, 200, {
            enabled: await RAGService.isEnabled(),
            storage: await RAGService.getStorageType(),
            ready: RAGService.isReady(),
          });
          logger.logWebRequest(method, path, 200);
        } catch (error) {
          context.respond(socket, 500, { error: 'rag_update_failed' });
          logger.logWebRequest(method, path, 500);
        }
        return true;
      }
    }

    if (segments[0] === 'reset' && method === 'POST') {
      try {
        await RAGService.clear();
        context.respond(socket, 200, { status: 'cleared' });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        context.respond(socket, 500, { error: 'rag_reset_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    return false;
  };
}
