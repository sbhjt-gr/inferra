import { logger } from '../../../utils/logger';

type StreamContext = {
  sendHTTPResponse: (socket: any, status: number, headers: Record<string, string>, body?: string) => void;
};

export function createStreamHandler(context: StreamContext) {
  return async (
    socket: any,
    generator: AsyncIterable<string>,
    format: 'sse' | 'ndjson' = 'sse'
  ): Promise<void> => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': format === 'sse' ? 'text/event-stream' : 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      };

      context.sendHTTPResponse(socket, 200, headers);

      for await (const chunk of generator) {
        if (!chunk) continue;

        let payload: string;
        if (format === 'sse') {
          payload = `data: ${chunk}\n\n`;
        } else {
          payload = chunk + '\n';
        }

        socket.write(payload);
      }

      if (format === 'sse') {
        socket.write('data: [DONE]\n\n');
      }

      socket.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'stream_failed';
      logger.error(`stream_handler_error:${message.replace(/\s+/g, '_')}`, 'http');
      socket.destroy();
    }
  };
}
