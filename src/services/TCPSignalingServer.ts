import TcpSocket from 'react-native-tcp-socket';
import * as Network from 'expo-network';
import Constants from 'expo-constants';
import { Buffer } from 'buffer';
import { modelDownloader } from './ModelDownloader';
import { logger } from '../utils/logger';

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice' | 'ping' | 'connected';
  data?: any;
  peerId?: string;
}

interface ServerStatus {
  isRunning: boolean;
  url: string;
  port: number;
  clientCount: number;
}

type ConnectionState = {
  isHTTP: boolean;
  hasSentOffer: boolean;
  offerTimer: ReturnType<typeof setTimeout> | null;
  buffer: string;
};

type HTTPHeaders = { [key: string]: string };

export class TCPSignalingServer {
  private server: any = null;
  private port: number = 8889;
  private clients: Map<string, any> = new Map();
  private offerSDP: string = '';
  private offerPeerId: string = '';
  private onAnswerReceived: ((answer: string, peerId: string) => void | Promise<void>) | null = null;
  private isRunning: boolean = false;
  private localIP: string = '';
  private connectionStates: Map<string, ConnectionState> = new Map();

  async start(
    offerSDP: string,
    offerPeerId: string,
    onAnswer: (answer: string, peerId: string) => void | Promise<void>
  ): Promise<ServerStatus> {
    if (this.isRunning) {
      this.offerSDP = offerSDP;
      this.offerPeerId = offerPeerId;
      this.onAnswerReceived = onAnswer;
      return {
        isRunning: true,
        url: `http://${this.localIP}:${this.port}`,
        port: this.port,
        clientCount: this.clients.size
      };
    }

    this.offerSDP = offerSDP;
    this.offerPeerId = offerPeerId;
    this.onAnswerReceived = onAnswer;

    try {
      this.server = TcpSocket.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.listen({ port: this.port, host: '0.0.0.0' }, async () => {
        this.localIP = await this.detectLocalIP();
        this.isRunning = true;
        
        logger.info(`tcp_signaling_server_started port:${this.port} ip:${this.localIP}`, 'webrtc');
      });

      this.server.on('error', (error: Error) => {
        logger.error(`tcp_server_error: ${error.message}`, 'webrtc');
      });

      await this.waitForServerStart();

      return {
        isRunning: true,
        url: `http://${this.localIP}:${this.port}`,
        port: this.port,
        clientCount: this.clients.size
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown_error';
      logger.error(`tcp_signaling_start_failed: ${errorMessage}`, 'webrtc');
      throw error;
    }
  }

  private async waitForServerStart(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.isRunning) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        if (!this.isRunning) {
          this.localIP = '0.0.0.0';
          this.isRunning = true;
        }
        resolve();
      }, 2000);
    });
  }

  private getLocalIPAddress(): string {
    try {
      const address = this.server.address();
      return address?.address || '0.0.0.0';
    } catch {
      return '0.0.0.0';
    }
  }

  private async detectLocalIP(): Promise<string> {
    try {
      const ip = await Network.getIpAddressAsync();
      if (ip && ip !== '0.0.0.0') {
        return ip;
      }
    } catch (error) {
      logger.warn('network_ip_detection_failed', 'webrtc');
    }

    return this.getLocalIPAddress();
  }

  private handleConnection(socket: any): void {
    const peerId = this.generatePeerId();
    this.clients.set(peerId, socket);
  const state: ConnectionState = { isHTTP: false, hasSentOffer: false, offerTimer: null, buffer: '' };
    this.connectionStates.set(peerId, state);

    logger.info(`tcp_client_connected peer:${peerId} total:${this.clients.size}`, 'webrtc');

    state.offerTimer = setTimeout(() => {
      if (!state.isHTTP && !state.hasSentOffer) {
        this.sendOffer(socket, peerId);
        state.hasSentOffer = true;
        state.offerTimer = null;
      }
    }, 20);

    socket.on('data', (data: Buffer) => {
      this.handleMessage(peerId, socket, data);
    });

    socket.on('close', () => {
      this.clients.delete(peerId);
      const connectionState = this.connectionStates.get(peerId);
      if (connectionState?.offerTimer) {
        clearTimeout(connectionState.offerTimer);
      }
      this.connectionStates.delete(peerId);
      logger.info(`tcp_client_disconnected peer:${peerId} total:${this.clients.size}`, 'webrtc');
    });

    socket.on('error', (error: Error) => {
      logger.error(`tcp_socket_error peer:${peerId} error:${error.message}`, 'webrtc');
      this.clients.delete(peerId);
      const connectionState = this.connectionStates.get(peerId);
      if (connectionState?.offerTimer) {
        clearTimeout(connectionState.offerTimer);
      }
      this.connectionStates.delete(peerId);
    });
  }

  private handleMessage(peerId: string, socket: any, chunk: Buffer): void {
    const state = this.connectionStates.get(peerId);
    if (!state) {
      return;
    }

    const text = chunk.toString('utf8');

    if (state.isHTTP || this.isHTTPRequest(text)) {
      void this.handleHTTPData(peerId, socket, text);
      return;
    }

    this.handleJSONMessage(peerId, socket, text);
  }

  private isHTTPRequest(data: string): boolean {
    const trimmed = data.trimStart();
    return trimmed.startsWith('GET ') || trimmed.startsWith('POST ') || trimmed.startsWith('DELETE ') || trimmed.startsWith('OPTIONS ') || trimmed.startsWith('HEAD ') || trimmed.startsWith('PUT ');
  }

  private handleJSONMessage(peerId: string, socket: any, rawData: string): void {
    try {
      const lines = rawData.split('\n').filter(line => line.trim().length > 0);

      for (const line of lines) {
        try {
          const message: SignalingMessage = JSON.parse(line);

          if (message.type === 'answer') {
            if (message.data && this.onAnswerReceived) {
              const targetPeerId = this.offerPeerId || message.peerId || peerId;
              this.onAnswerReceived(message.data, targetPeerId);
              this.sendMessage(socket, {
                type: 'connected',
                data: { success: true }
              });
              logger.info(`answer_received_from_peer peer:${targetPeerId}`, 'webrtc');
            }
          } else if (message.type === 'ice') {
            logger.debug(`ice_candidate_received peer:${peerId}`, 'webrtc');
          } else if (message.type === 'ping') {
            this.sendMessage(socket, { type: 'ping', data: 'pong' });
          } else {
            logger.warn(`unknown_message_type type:${message.type} peer:${peerId}`, 'webrtc');
          }
        } catch (parseError) {
          continue;
        }
      }
    } catch (error) {
      logger.error(`message_parse_error peer:${peerId}`, 'webrtc');
    }
  }

  private async handleHTTPData(peerId: string, socket: any, chunk: string): Promise<void> {
    const state = this.connectionStates.get(peerId);
    if (!state) {
      return;
    }

    state.isHTTP = true;
    state.hasSentOffer = true;
    if (state.offerTimer) {
      clearTimeout(state.offerTimer);
      state.offerTimer = null;
    }

    state.buffer += chunk;

    while (true) {
      const separatorIndex = state.buffer.indexOf('\r\n\r\n');
      if (separatorIndex === -1) {
        return;
      }

      const headerPart = state.buffer.slice(0, separatorIndex);
      const requestLineEnd = headerPart.indexOf('\r\n');
      const requestLine = requestLineEnd === -1 ? headerPart : headerPart.slice(0, requestLineEnd);
      const headersPart = requestLineEnd === -1 ? '' : headerPart.slice(requestLineEnd + 2);
      const headerLines = headersPart.length > 0 ? headersPart.split('\r\n') : [];
      const headers: HTTPHeaders = {};

      for (const headerLine of headerLines) {
        const separatorPos = headerLine.indexOf(':');
        if (separatorPos !== -1) {
          const key = headerLine.slice(0, separatorPos).trim().toLowerCase();
          const value = headerLine.slice(separatorPos + 1).trim();
          headers[key] = value;
        }
      }

      const contentLength = parseInt(headers['content-length'] || '0', 10);
      const totalLength = separatorIndex + 4 + contentLength;

      if (state.buffer.length < totalLength) {
        return;
      }

      const body = state.buffer.slice(separatorIndex + 4, separatorIndex + 4 + contentLength);
      state.buffer = state.buffer.slice(totalLength);

      try {
        await this.handleHTTPRequest(peerId, socket, requestLine, headers, body);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        logger.error(`http_request_failed:${message}`, 'webrtc');
        try {
          this.sendJSONResponse(socket, 500, { error: 'server_error' });
        } catch (writeError) {
          const writeMessage = writeError instanceof Error ? writeError.message : 'write_failed';
          logger.error(`http_response_failed:${writeMessage}`, 'webrtc');
          try {
            socket.destroy();
          } catch {}
        }
        return;
      }

      if (state.buffer.length === 0) {
        return;
      }
    }
  }

  private async handleHTTPRequest(peerId: string, socket: any, requestLine: string, headers: HTTPHeaders, body: string): Promise<void> {
    logger.info(`http_request_received: ${requestLine} peer:${peerId}`, 'webrtc');

    const parts = requestLine.split(' ');
    const method = parts[0] || '';
    const rawPath = parts[1] || '/';
    const path = rawPath.split('?')[0];

    if (method === 'OPTIONS') {
      this.sendHTTPResponse(socket, 204, {
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }, '');
      logger.logWebRequest(method, path, 204);
      return;
    }

    if (method === 'GET' && path === '/') {
      const bodyContent = `<!DOCTYPE html>
<html>
<head><title>Inferra Local Server</title></head>
<body>
  <h1>Inferra Local Server</h1>
  <p>Status: Running</p>
  <p>Version: ${this.getAppVersion()}</p>
  <p>Available endpoints:</p>
  <ul>
    <li><code>GET /api/tags</code></li>
    <li><code>POST /api/pull</code></li>
    <li><code>DELETE /api/delete</code></li>
    <li><code>GET /api/version</code></li>
    <li><code>GET /offer</code></li>
    <li><code>POST /webrtc/answer</code></li>
  </ul>
  <p>Visit <a href="/offer">/offer</a> to retrieve the current WebRTC offer.</p>
</body>
</html>`;
      this.sendHTTPResponse(socket, 200, { 'Content-Type': 'text/html; charset=utf-8' }, bodyContent);
      logger.logWebRequest(method, path, 200);
      return;
    }

    if (method === 'GET' && (path === '/offer' || path === '/webrtc/offer')) {
      if (!this.offerSDP || !this.offerPeerId) {
        this.sendJSONResponse(socket, 503, { error: 'offer_unavailable' });
        logger.logWebRequest(method, path, 503);
        return;
      }

      this.sendJSONResponse(socket, 200, {
        type: 'offer',
        data: this.offerSDP,
        peerId: this.offerPeerId
      });
      logger.logWebRequest(method, path, 200);
      return;
    }

    if (method === 'POST' && path === '/webrtc/answer') {
      if (!body) {
        this.sendJSONResponse(socket, 400, { error: 'empty_body' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      if (!payload || typeof payload.sdp !== 'string') {
        this.sendJSONResponse(socket, 400, { error: 'missing_sdp' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      const targetPeerId = typeof payload.peerId === 'string' && payload.peerId.length > 0 ? payload.peerId : this.offerPeerId;

      if (!targetPeerId || !this.onAnswerReceived) {
        this.sendJSONResponse(socket, 503, { error: 'peer_unavailable' });
        logger.logWebRequest(method, path, 503);
        return;
      }

      try {
        await this.onAnswerReceived(payload.sdp, targetPeerId);
        this.sendJSONResponse(socket, 200, { status: 'connected', peerId: targetPeerId });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        this.sendJSONResponse(socket, 500, { error: 'answer_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return;
    }

    if (method === 'GET' && path === '/api/tags') {
      try {
        const models = await modelDownloader.getStoredModels();
        const items = models.map(model => ({
          name: model.name,
          modified_at: model.modified,
          size: model.size,
          digest: null,
          model_type: model.modelType,
          is_external: model.isExternal === true
        }));
        this.sendJSONResponse(socket, 200, { models: items });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        this.sendJSONResponse(socket, 500, { error: 'models_unavailable' });
        logger.logWebRequest(method, path, 500);
      }
      return;
    }

    if (method === 'POST' && path === '/api/pull') {
      if (!body) {
        this.sendJSONResponse(socket, 400, { error: 'empty_body' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      const url = typeof payload.url === 'string' && payload.url.length > 0 ? payload.url : null;
      const modelName = typeof payload.model === 'string' && payload.model.length > 0 ? payload.model : typeof payload.name === 'string' ? payload.name : null;

      if (!url || !modelName) {
        this.sendJSONResponse(socket, 400, { error: 'missing_parameters' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        this.sendJSONResponse(socket, 400, { error: 'unsupported_url' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      try {
        const result = await modelDownloader.downloadModel(url, modelName);
        this.sendJSONResponse(socket, 200, {
          status: 'downloading',
          model: modelName,
          downloadId: result.downloadId
        });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        this.sendJSONResponse(socket, 500, { error: 'download_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return;
    }

    if (method === 'DELETE' && path === '/api/delete') {
      if (!body) {
        this.sendJSONResponse(socket, 400, { error: 'empty_body' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      const targetPath = typeof payload.path === 'string' && payload.path.length > 0 ? payload.path : null;
      const targetName = typeof payload.name === 'string' && payload.name.length > 0 ? payload.name : null;

      if (!targetPath && !targetName) {
        this.sendJSONResponse(socket, 400, { error: 'missing_parameters' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      try {
        const models = await modelDownloader.getStoredModels();
        let target = null;

        if (targetPath) {
          target = models.find(model => model.path === targetPath) || null;
        }

        if (!target && targetName) {
          target = models.find(model => model.name === targetName) || null;
        }

        if (!target) {
          this.sendJSONResponse(socket, 404, { error: 'model_not_found' });
          logger.logWebRequest(method, path, 404);
          return;
        }

        await modelDownloader.deleteModel(target.path);
        this.sendJSONResponse(socket, 200, { status: 'deleted', name: target.name });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        this.sendJSONResponse(socket, 500, { error: 'delete_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return;
    }

    if (method === 'GET' && path === '/api/version') {
      this.sendJSONResponse(socket, 200, { version: this.getAppVersion() });
      logger.logWebRequest(method, path, 200);
      return;
    }

    this.sendJSONResponse(socket, 404, { error: 'not_found' });
    logger.logWebRequest(method, path, 404);
  }

  private sendHTTPResponse(socket: any, status: number, headers: Record<string, string>, body: string): void {
    const statusText = this.getStatusText(status);
    const responseHeaders: Record<string, string> = {
      'Content-Length': Buffer.byteLength(body, 'utf8').toString(),
      'Connection': 'close',
      'Access-Control-Allow-Origin': '*',
      ...headers,
    };

    const headerLines = Object.entries(responseHeaders)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');

    const response = `HTTP/1.1 ${status} ${statusText}\r\n${headerLines}\r\n\r\n${body}`;

    try {
      socket.write(response, () => {
        socket.end();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'write_failed';
      logger.error(`http_write_error:${message}`, 'webrtc');
      try {
        socket.destroy();
      } catch {}
    }
  }

  private sendJSONResponse(socket: any, status: number, payload: any): void {
    const body = JSON.stringify(payload);
    this.sendHTTPResponse(socket, status, { 'Content-Type': 'application/json; charset=utf-8' }, body);
  }

  private getStatusText(status: number): string {
    switch (status) {
      case 200:
        return 'OK';
      case 201:
        return 'Created';
      case 204:
        return 'No Content';
      case 400:
        return 'Bad Request';
      case 404:
        return 'Not Found';
      case 500:
        return 'Internal Server Error';
      case 503:
        return 'Service Unavailable';
      default:
        return 'OK';
    }
  }

  private getAppVersion(): string {
    const expoVersion = (Constants.expoConfig && Constants.expoConfig.version) || null;
    const manifestVersion = (Constants.manifest as any)?.version || null;
    return expoVersion || manifestVersion || 'unknown';
  }

  private sendMessage(socket: any, message: SignalingMessage): void {
    try {
      const data = JSON.stringify(message) + '\n';
      socket.write(data);
    } catch (error) {
      logger.error('tcp_send_error', 'webrtc');
    }
  }

  private sendOffer(socket: any, peerId: string): void {
    if (!this.offerSDP) {
      return;
    }
    const targetPeerId = this.offerPeerId || peerId;
    this.sendMessage(socket, {
      type: 'offer',
      data: this.offerSDP,
      peerId: targetPeerId
    });
  }

  private generatePeerId(): string {
    return `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.clients.forEach((socket) => {
      try {
        socket.destroy();
      } catch (error) {
      }
    });
    this.clients.clear();

    if (this.server) {
      try {
        this.server.close();
        this.server = null;
      } catch (error) {
        logger.error('tcp_server_close_error', 'webrtc');
      }
    }

    this.isRunning = false;
    this.offerSDP = '';
    this.offerPeerId = '';
    this.onAnswerReceived = null;

    logger.info('tcp_signaling_server_stopped', 'webrtc');
  }

  getStatus(): ServerStatus {
    return {
      isRunning: this.isRunning,
      url: `http://${this.localIP}:${this.port}`,
      port: this.port,
      clientCount: this.clients.size
    };
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const tcpSignalingServer = new TCPSignalingServer();
