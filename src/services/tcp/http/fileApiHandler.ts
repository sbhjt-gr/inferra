import * as FileSystem from 'expo-file-system';
import { RAGService } from '../../rag/RAGService';
import { logger } from '../../../utils/logger';
import type { ApiHandler, JsonResponder } from './apiTypes';
import { normalizeProvider } from './providerUtils';

type Context = {
  respond: JsonResponder;
};

export function createFileApiHandler(context: Context): ApiHandler {
  return async (method, segments, body, socket, path) => {
    if (method === 'POST' && segments[0] === 'ingest') {
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

      let content = typeof payload?.content === 'string' ? payload.content : null;
      const fileName = typeof payload?.fileName === 'string' ? payload.fileName : 'uploaded.txt';
      const filePath = typeof payload?.filePath === 'string' ? payload.filePath : null;
      const files = Array.isArray(payload?.files) ? payload.files : null;
      const model = typeof payload?.model === 'string' ? payload.model : undefined;
      const provider = normalizeProvider(payload?.provider);
      const useRag = payload?.rag !== false;

      if (!content && !filePath && !files) {
        context.respond(socket, 400, { error: 'content_or_file_required' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      try {
        if (filePath && !content) {
          const fileInfo = await FileSystem.getInfoAsync(filePath);
          if (!fileInfo.exists) {
            context.respond(socket, 404, { error: 'file_not_found' });
            logger.logWebRequest(method, path, 404);
            return true;
          }
          content = await FileSystem.readAsStringAsync(filePath);
        }

        if (files && !content) {
          const fileContents: string[] = [];
          for (const file of files) {
            const path = typeof file === 'string' ? file : file?.path;
            if (path) {
              const fileInfo = await FileSystem.getInfoAsync(path);
              if (fileInfo.exists) {
                const fileContent = await FileSystem.readAsStringAsync(path);
                fileContents.push(fileContent);
              }
            }
          }
          content = fileContents.join('\n\n');
        }

        if (!content) {
          context.respond(socket, 400, { error: 'content_required' });
          logger.logWebRequest(method, path, 400);
          return true;
        }

        if (!useRag) {
          context.respond(socket, 200, {
            status: 'skipped',
            reason: 'rag_disabled',
          });
          logger.logWebRequest(method, path, 200);
          return true;
        }

        const ragEnabled = await RAGService.isEnabled();
        if (!ragEnabled) {
          await RAGService.setEnabled(true);
        }

        await RAGService.initialize(provider);
        if (!RAGService.isReady()) {
          context.respond(socket, 503, { error: 'rag_not_ready' });
          logger.logWebRequest(method, path, 503);
          return true;
        }

        const documentId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await RAGService.addDocument({
          id: documentId,
          content,
          fileName,
          fileType: fileName.split('.').pop(),
          timestamp: Date.now(),
        });

        context.respond(socket, 200, {
          status: 'stored',
          documentId,
          fileName,
          model: model || null,
        });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'rag_ingest_failed';
        const safe = message.replace(/\s+/g, '_');
        logger.error(`rag_ingest_failed:${safe}`, 'webrtc');
        context.respond(socket, 500, { error: 'rag_ingest_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    return false;
  };
}
