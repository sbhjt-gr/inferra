import { WebRTCMessage, WebRTCResponse } from './WebRTCTypes';
import { webrtcAPIHandler } from '../WebRTCAPIHandler';

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
  private apiHandler = webrtcAPIHandler;

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
      const bridgeMessage = {
        action,
        data: message.data || {},
      };

      const result = await this.apiHandler.handleMessage(bridgeMessage);
      
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
      const bridgeMessage = {
        action,
        data: message.data || {},
      };

      this.apiHandler.handleStream(bridgeMessage, (chunk: any) => {
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
