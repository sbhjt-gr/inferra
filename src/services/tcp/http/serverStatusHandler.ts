import { llamaManager } from '../../../utils/LlamaManager';
import { RAGService } from '../../rag/RAGService';
import { logger } from '../../../utils/logger';
import type { JsonResponder, StatusHandler } from './apiTypes';

type Context = {
  respond: JsonResponder;
  getStatus: () => {
    isRunning: boolean;
    url: string;
    port: number;
    clientCount: number;
  };
};

export function createServerStatusHandler(context: Context): StatusHandler {
  return async (method, socket, path) => {
    if (method !== 'GET') {
      return false;
    }

    const status = context.getStatus();
    const modelLoaded = llamaManager.isInitialized();
    const modelPath = llamaManager.getModelPath();

    context.respond(socket, 200, {
      server: status,
      model: {
        loaded: modelLoaded,
        path: modelPath,
      },
      rag: {
        ready: RAGService.isReady(),
      },
    });
    logger.logWebRequest(method, path, 200);
    return true;
  };
}
