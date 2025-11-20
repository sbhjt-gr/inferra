import { llamaManager } from '../../../utils/LlamaManager';
import { logger } from '../../../utils/logger';
import type { StoredModel } from '../../ModelDownloaderTypes';

type EnsureModelLoadedFn = (identifier?: string) => Promise<{ model: StoredModel; projectorPath?: string }>;
type ParseHttpErrorFn = (error: unknown) => { status: number; code: string; message: string };

type Context = {
  respond: (socket: any, status: number, payload: any) => void;
  ensureModelLoaded: EnsureModelLoadedFn;
  parseHttpError: ParseHttpErrorFn;
};

export function createEmbeddingsHandler(context: Context) {
  return async (method: string, path: string, body: string, socket: any): Promise<boolean> => {
    if (method !== 'POST' || path !== '/api/embeddings') {
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

    const identifier = typeof payload.model === 'string' ? payload.model : undefined;
    const input = payload.input ?? payload.prompt ?? payload.text;

    let inputs: string[] = [];

    if (typeof input === 'string') {
      inputs = [input];
    } else if (Array.isArray(input)) {
      inputs = input.filter((item: any) => typeof item === 'string');
    }

    if (inputs.length === 0) {
      context.respond(socket, 400, { error: 'input_required' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    let target: { model: StoredModel; projectorPath?: string };

    try {
      target = await context.ensureModelLoaded(identifier);
    } catch (error) {
      const parsed = context.parseHttpError(error);
      const safeMessage = parsed.message.replace(/\s+/g, '_');
      logger.error(`api_embeddings_model:${safeMessage}`, 'http');
      context.respond(socket, parsed.status, { error: parsed.code });
      logger.logWebRequest(method, path, parsed.status);
      return true;
    }

    try {
      const vectors: number[][] = [];

      for (const text of inputs) {
        const vector = await llamaManager.generateEmbedding(text);
        vectors.push(vector);
      }

      if (vectors.length === 1) {
        context.respond(socket, 200, {
          model: target.model.name,
          created_at: new Date().toISOString(),
          embedding: vectors[0]
        });
      } else {
        context.respond(socket, 200, {
          model: target.model.name,
          created_at: new Date().toISOString(),
          embeddings: vectors
        });
      }
      logger.logWebRequest(method, path, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'embedding_failed';
      const safeMessage = message.replace(/\s+/g, '_');
      logger.error(`api_embeddings_failed:${safeMessage}`, 'http');
      context.respond(socket, 500, { error: 'embedding_failed' });
      logger.logWebRequest(method, path, 500);
    }
    return true;
  };
}
