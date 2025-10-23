import TcpSocket from 'react-native-tcp-socket';
import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import { loadLlamaModelInfo } from 'llama.rn';
import { Buffer } from 'buffer';
import { modelDownloader } from './ModelDownloader';
import { modelSettingsService, type ModelSettings } from './ModelSettingsService';
import { StoredModel } from './ModelDownloaderTypes';
import { llamaManager } from '../utils/LlamaManager';
import { logger } from '../utils/logger';
import type { ApiHandler, StatusHandler } from './tcp/http/apiTypes';
import { createChatApiHandler } from './tcp/http/createChatApiHandler';
import { createFileApiHandler } from './tcp/http/createFileApiHandler';
import { createRagApiHandler } from './tcp/http/createRagApiHandler';
import { createModelApiHandler } from './tcp/http/createModelApiHandler';
import { createSettingsApiHandler } from './tcp/http/createSettingsApiHandler';
import { createServerStatusHandler } from './tcp/http/createServerStatusHandler';
import { createAppleFoundationHandler } from './tcp/http/createAppleFoundationHandler';
import { createRemoteModelHandler } from './tcp/http/createRemoteModelHandler';
import { getHomepageHTML } from './tcp/http/homepageTemplate';
import { buildCustomSettings } from './tcp/http/settingsBuilder';
import { createStreamChatResponse } from './tcp/http/streamChatResponse';
import { parseMessagesFromPayload, parseMessagesOrPromptFromPayload } from './tcp/http/messageParser';
import { parseJsonBody } from './tcp/http/jsonParser';
import { handleChatRequest, handleGenerateRequest } from './tcp/http/chatHandlers';
import { handleShowRequest, handleEmbeddingsRequest } from './tcp/http/modelHandlers';
import { parseHTTPBuffer, type HTTPHeaders } from './tcp/http/httpParser';
import { getHTTPStatusText } from './tcp/http/httpStatus';
import { handleCopyRequest, handleTagsRequest, handlePullRequest, handleDeleteRequest, handlePsRequest } from './tcp/http/modelOperations';
import { sendChunkedResponseStart, writeChunk, endChunkedResponse } from './tcp/http/responseUtils';
import { getFileSize, findStoredModel } from './tcp/http/modelUtils';

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
  private activeModel: { path: string; name: string; startedAt: string } | null = null;
  private readonly chatApiHandler: ApiHandler;
  private readonly fileApiHandler: ApiHandler;
  private readonly ragApiHandler: ApiHandler;
  private readonly modelApiHandler: ApiHandler;
  private readonly settingsApiHandler: ApiHandler;
  private readonly serverStatusHandler: StatusHandler;
  private readonly appleFoundationHandler: ApiHandler;
  private readonly remoteModelHandler: ApiHandler;
  private readonly streamChatResponse: (
    socket: any,
    method: string,
    path: string,
    model: StoredModel,
    messages: Array<{ role: string; content: string }>,
    settings?: ModelSettings
  ) => Promise<void>;

  constructor() {
    const respond = this.sendJSONResponse.bind(this);
    this.chatApiHandler = createChatApiHandler({ respond });
    this.fileApiHandler = createFileApiHandler({ respond });
    this.ragApiHandler = createRagApiHandler({ respond });
    this.settingsApiHandler = createSettingsApiHandler({ respond });
    this.appleFoundationHandler = createAppleFoundationHandler({ respond });
    this.remoteModelHandler = createRemoteModelHandler({ respond });
    this.modelApiHandler = createModelApiHandler({
      respond,
      ensureModelLoaded: this.ensureModelLoaded.bind(this),
      parseHttpError: this.parseHttpError.bind(this),
      appleHandler: this.appleFoundationHandler,
      remoteHandler: this.remoteModelHandler,
    });
    this.serverStatusHandler = createServerStatusHandler({
      respond,
      getStatus: () => this.getStatus(),
    });
    this.streamChatResponse = createStreamChatResponse({
      sendChunkedResponseStart,
      writeChunk,
      endChunkedResponse,
      getStatusText: getHTTPStatusText,
    });
  }

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

  private createHttpError(status: number, code: string): never {
    const error = new Error(code);
    (error as any).status = status;
    (error as any).code = code;
    throw error;
  }

  private parseHttpError(error: unknown): { status: number; code: string; message: string } {
    if (error instanceof Error) {
      const status = (error as any).status;
      const code = (error as any).code;
      return {
        status: typeof status === 'number' ? status : 500,
        code: typeof code === 'string' ? code : 'server_error',
        message: error.message
      };
    }

    if (error && typeof error === 'object') {
      const status = (error as any).status;
      const code = (error as any).code;
      return {
        status: typeof status === 'number' ? status : 500,
        code: typeof code === 'string' ? code : 'server_error',
        message: 'server_error'
      };
    }

    return {
      status: 500,
      code: 'server_error',
      message: typeof error === 'string' ? error : 'server_error'
    };
  }

  private findStoredModel(identifier: string, models: StoredModel[]): StoredModel | null {
    const trimmed = identifier.trim();
    if (!trimmed) {
      return null;
    }

    const normalized = trimmed.toLowerCase();
    const alias = trimmed.split(':')[0];
    const aliasNormalized = alias.toLowerCase();
    let target = models.find(item => {
      const name = item.name.toLowerCase();
      return name === normalized || name === aliasNormalized;
    });

    if (!target) {
      target = models.find(item => item.path.toLowerCase() === normalized);
    }

    if (!target) {
      const basename = trimmed.split('/').pop();
      if (basename) {
        const baseNormalized = basename.toLowerCase();
        target = models.find(item => item.name.toLowerCase() === baseNormalized);
      }
    }

    return target || null;
  }

  private async ensureModelLoaded(identifier?: string): Promise<{ model: StoredModel; projectorPath?: string }> {
    const models = await modelDownloader.getStoredModels();
    let target: StoredModel | null = null;

    if (identifier && identifier.trim().length > 0) {
      target = this.findStoredModel(identifier, models);
      if (!target) {
        this.createHttpError(404, 'model_not_found');
      }
    } else {
      if (this.activeModel && llamaManager.isInitialized() && llamaManager.getModelPath() === this.activeModel.path) {
        target = this.findStoredModel(this.activeModel.path, models) || this.findStoredModel(this.activeModel.name, models);
      }

      if (!target && llamaManager.isInitialized()) {
        const currentPath = llamaManager.getModelPath();
        if (currentPath) {
          target = this.findStoredModel(currentPath, models);
        }
      }

      if (!target) {
        this.createHttpError(503, 'model_not_loaded');
      }
    }

    if (!target) {
      this.createHttpError(503, 'model_not_loaded');
    }

    const projectorPath = target.defaultProjectionModel
      ? models.find(item => item.name === target!.defaultProjectionModel || item.path === target!.defaultProjectionModel)?.path
      : undefined;

    const isInitialized = llamaManager.isInitialized();
    const currentPath = llamaManager.getModelPath();

    if (!isInitialized || currentPath !== target.path) {
      await llamaManager.loadModel(target.path, projectorPath);
      this.activeModel = { path: target.path, name: target.name, startedAt: new Date().toISOString() };
    } else if (!this.activeModel || this.activeModel.path !== target.path) {
      this.activeModel = { path: target.path, name: target.name, startedAt: new Date().toISOString() };
    }

    return { model: target, projectorPath };
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
      const parsed = parseHTTPBuffer(state.buffer);
      
      if (parsed.needsMoreData) {
        return;
      }

      if (!parsed.request) {
        return;
      }

      state.buffer = parsed.remainingBuffer;

      try {
        await this.handleHTTPRequest(peerId, socket, parsed.request.requestLine, parsed.request.headers, parsed.request.body);
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
  const segments = path.split('/').filter(segment => segment.length > 0);

    if (method === 'OPTIONS') {
      this.sendHTTPResponse(socket, 204, {
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }, '');
      logger.logWebRequest(method, path, 204);
      return;
    }

    if (method === 'GET' && path === '/') {
      const bodyContent = getHomepageHTML();
      this.sendHTTPResponse(socket, 200, { 'Content-Type': 'text/html; charset=utf-8' }, bodyContent);
      logger.logWebRequest(method, path, 200);
      return;
    }


    if (await this.handleExtendedApiRequest(method, path, segments, body, socket)) {
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
      const { payload, error: parseError } = parseJsonBody(body);
      if (parseError) {
        this.sendJSONResponse(socket, 400, { error: parseError });
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

    if (method === 'POST' && path === '/api/chat') {
      await handleChatRequest(
        body,
        socket,
        method,
        path,
        this.ensureModelLoaded.bind(this),
        this.parseHttpError.bind(this),
        this.streamChatResponse,
        this.sendJSONResponse.bind(this)
      );
      return;
    }

    if (method === 'POST' && path === '/api/generate') {
      await handleGenerateRequest(
        body,
        socket,
        method,
        path,
        this.ensureModelLoaded.bind(this),
        this.parseHttpError.bind(this),
        this.streamChatResponse,
        this.sendJSONResponse.bind(this)
      );
      return;
    }

    if (method === 'POST' && path === '/api/show') {
      await handleShowRequest(
        body,
        socket,
        method,
        path,
        this.findStoredModel.bind(this),
        this.sendJSONResponse.bind(this)
      );
      return;
    }

    if (method === 'POST' && path === '/api/embeddings') {
      await handleEmbeddingsRequest(
        body,
        socket,
        method,
        path,
        this.ensureModelLoaded.bind(this),
        this.parseHttpError.bind(this),
        this.sendJSONResponse.bind(this)
      );
      return;
    }

    if (method === 'GET' && path === '/api/ps') {
      await handlePsRequest(
        socket,
        method,
        path,
        this.sendJSONResponse.bind(this),
        () => llamaManager.isInitialized(),
        () => llamaManager.getModelPath(),
        this.findStoredModel.bind(this),
        getFileSize,
        () => this.activeModel
      );
      return;
    }

    if (method === 'POST' && path === '/api/copy') {
      await handleCopyRequest(
        body,
        socket,
        method,
        path,
        this.findStoredModel.bind(this),
        this.sendJSONResponse.bind(this)
      );
      return;
    }

    if (method === 'GET' && path === '/api/tags') {
      await handleTagsRequest(
        socket,
        method,
        path,
        this.sendJSONResponse.bind(this)
      );
      return;
    }

    if (method === 'POST' && path === '/api/pull') {
      await handlePullRequest(
        body,
        socket,
        method,
        path,
        this.sendJSONResponse.bind(this)
      );
      return;
    }

    if (method === 'DELETE' && path === '/api/delete') {
      await handleDeleteRequest(
        body,
        socket,
        method,
        path,
        this.sendJSONResponse.bind(this)
      );
      return;
    }

    if (method === 'GET' && path === '/api/version') {
      const version = (Constants.expoConfig && Constants.expoConfig.version) || (Constants.manifest as any)?.version || 'unknown';
      this.sendJSONResponse(socket, 200, { version });
      logger.logWebRequest(method, path, 200);
      return;
    }

    this.sendJSONResponse(socket, 404, { error: 'not_found' });
    logger.logWebRequest(method, path, 404);
  }

  private async handleExtendedApiRequest(
    method: string,
    path: string,
    segments: string[],
    body: string,
    socket: any
  ): Promise<boolean> {
    if (segments.length === 0 || segments[0] !== 'api') {
      return false;
    }

    const resource = segments[1] || '';

    switch (resource) {
      case 'chats':
        return await this.chatApiHandler(method, segments.slice(2), body, socket, path);
      case 'files':
        return await this.fileApiHandler(method, segments.slice(2), body, socket, path);
      case 'rag':
        return await this.ragApiHandler(method, segments.slice(2), body, socket, path);
      case 'status':
        return await this.serverStatusHandler(method, socket, path);
      case 'models':
        return await this.modelApiHandler(method, segments.slice(2), body, socket, path);
      case 'settings':
        return await this.settingsApiHandler(method, segments.slice(2), body, socket, path);
      default:
        return false;
    }
  }




  private sendHTTPResponse(socket: any, status: number, headers: Record<string, string>, body: string): void {
    const statusText = getHTTPStatusText(status);
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
