import { WebRTCMessage, WebRTCResponse } from './WebRTCTypes';

const API_ENDPOINTS: Record<string, string> = {
  '/api/models/list': 'getModels',
  '/api/models/current': 'getCurrentModel',
  '/api/models/load': 'loadModel',
  '/api/models/unload': 'unloadModel',
  '/api/chat': 'chat',
  '/api/chat/stream': 'chatStream',
  '/api/online-models': 'getOnlineModels',
};

export class WebRTCMessageRouter {
  private requestCount = new Map<string, { count: number; resetTime: number }>();
  private messageHandler?: (message: any) => Promise<any>;
  private streamHandler?: (message: any, callback: (chunk: any) => void) => void;

  setHandlers(handlers: {
    onMessage?: (message: any) => Promise<any>;
    onStream?: (message: any, callback: (chunk: any) => void) => void;
  }) {
    this.messageHandler = handlers.onMessage;
    this.streamHandler = handlers.onStream;
  }

  async handleMessage(message: WebRTCMessage, peerId: string): Promise<WebRTCResponse> {
    if (!this.checkRateLimit(peerId)) {
      return {
        id: message.id,
        endpoint: message.endpoint,
        success: false,
        error: 'rate_limit_exceeded',
      };
    }

    if (JSON.stringify(message).length > 1048576) {
      return {
        id: message.id,
        endpoint: message.endpoint,
        success: false,
        error: 'message_too_large',
      };
    }

    const action = API_ENDPOINTS[message.endpoint];
    
    if (!action) {
      return {
        id: message.id,
        endpoint: message.endpoint,
        success: false,
        error: 'endpoint_not_found',
      };
    }

    try {
      if (!this.messageHandler) {
        throw new Error('message_handler_not_set');
      }

      const bridgeMessage = {
        id: message.id,
        type: 'request',
        action,
        data: message.data || {},
      };

      const result = await this.messageHandler(bridgeMessage);
      
      return {
        id: message.id,
        endpoint: message.endpoint,
        success: result.success,
        data: result.data,
        error: result.error,
      };
    } catch (error: any) {
      console.error('webrtc_router_error', { endpoint: message.endpoint, error });
      return {
        id: message.id,
        endpoint: message.endpoint,
        success: false,
        error: error.message || 'internal_error',
      };
    }
  }

  handleStreamMessage(
    message: WebRTCMessage,
    peerId: string,
    sendChunk: (chunk: any) => void
  ): void {
    const action = API_ENDPOINTS[message.endpoint];
    
    if (!action) {
      sendChunk({ done: true, error: 'endpoint_not_found' });
      return;
    }

    try {
      if (!this.streamHandler) {
        sendChunk({ done: true, error: 'stream_handler_not_set' });
        return;
      }

      const bridgeMessage = {
        id: message.id,
        type: 'stream',
        action,
        data: message.data || {},
      };

      this.streamHandler(bridgeMessage, (chunk: any) => {
        sendChunk(chunk);
      });
    } catch (error: any) {
      console.error('webrtc_stream_error', { endpoint: message.endpoint, error });
      sendChunk({ done: true, error: error.message || 'internal_error' });
    }
  }

  private checkRateLimit(peerId: string): boolean {
    const now = Date.now();
    const record = this.requestCount.get(peerId);

    if (!record || now > record.resetTime) {
      this.requestCount.set(peerId, {
        count: 1,
        resetTime: now + 60000,
      });
      return true;
    }

    if (record.count >= 60) {
      return false;
    }

    record.count++;
    return true;
  }

  clearPeerData(peerId: string): void {
    this.requestCount.delete(peerId);
  }
}
