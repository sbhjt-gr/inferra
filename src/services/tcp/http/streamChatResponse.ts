import { llamaManager } from '../../../utils/LlamaManager';
import { logger } from '../../../utils/logger';
import type { StoredModel } from '../../ModelDownloaderTypes';
import type { ModelSettings } from '../../ModelSettingsService';

type StreamContext = {
  sendChunkedResponseStart: (socket: any, status: number, headers: Record<string, string>) => void;
  writeChunk: (socket: any, payload: any) => void;
  endChunkedResponse: (socket: any) => void;
  getStatusText: (status: number) => string;
};

export function createStreamChatResponse(context: StreamContext) {
  return async (
    socket: any,
    method: string,
    path: string,
    model: StoredModel,
    messages: Array<{ role: string; content: string }>,
    settings?: ModelSettings
  ): Promise<void> => {
    try {
      context.sendChunkedResponseStart(socket, 200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
    } catch (error) {
      const writeMessage = error instanceof Error ? error.message : 'write_failed';
      const safeMessage = writeMessage.replace(/\s+/g, '_');
      logger.error(`stream_header_failed:${safeMessage}`, 'webrtc');
      try {
        socket.destroy();
      } catch {}
      logger.logWebRequest(method, path, 500);
      return;
    }

    const started = Date.now();

    try {
      const full = await llamaManager.generateResponse(
        messages,
        (token: string) => {
          try {
            context.writeChunk(socket, {
              model: model.name,
              created_at: new Date().toISOString(),
              response: token,
              done: false
            });
          } catch (error) {
            const writeMessage = error instanceof Error ? error.message : 'write_failed';
            const safeMessage = writeMessage.replace(/\s+/g, '_');
            logger.error(`stream_chunk_failed:${safeMessage}`, 'webrtc');
            return false;
          }
          return true;
        },
        settings
      );

      const duration = Date.now() - started;

      context.writeChunk(socket, {
        model: model.name,
        created_at: new Date().toISOString(),
        response: '',
        done: true,
        total_duration_ms: duration,
        output: full
      });

      context.endChunkedResponse(socket);
      logger.logWebRequest(method, path, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'generation_failed';
      try {
        context.writeChunk(socket, {
          model: model.name,
          created_at: new Date().toISOString(),
          error: message,
          done: true
        });
        context.endChunkedResponse(socket);
      } catch (writeError) {
        const writeMessage = writeError instanceof Error ? writeError.message : 'write_failed';
        const safeMessage = writeMessage.replace(/\s+/g, '_');
        logger.error(`stream_error_write:${safeMessage}`, 'webrtc');
        try {
          socket.destroy();
        } catch {}
      }
      logger.logWebRequest(method, path, 500);
    }
  };
}
