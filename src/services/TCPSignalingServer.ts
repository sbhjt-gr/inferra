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
  private activeModel: { path: string; name: string; startedAt: string } | null = null;

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

  private resolveProjectorPath(models: StoredModel[], model: StoredModel): string | undefined {
    if (!model.defaultProjectionModel) {
      return undefined;
    }

    const target = models.find(item => item.name === model.defaultProjectionModel || item.path === model.defaultProjectionModel);
    return target?.path;
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

    const projectorPath = this.resolveProjectorPath(models, target);

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

  private buildCustomSettings(options: any): ModelSettings | undefined {
    if (!options || typeof options !== 'object') {
      return undefined;
    }

    const base = llamaManager.getSettings();
    let changed = false;

    if (Object.prototype.hasOwnProperty.call(options, 'temperature') && typeof options.temperature === 'number') {
      base.temperature = options.temperature;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'top_p') && typeof options.top_p === 'number') {
      base.topP = options.top_p;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'top_k') && typeof options.top_k === 'number') {
      base.topK = options.top_k;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'min_p') && typeof options.min_p === 'number') {
      base.minP = options.min_p;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'num_predict') && typeof options.num_predict === 'number') {
      base.maxTokens = options.num_predict;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'seed') && typeof options.seed === 'number') {
      base.seed = options.seed;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'repeat_penalty') && typeof options.repeat_penalty === 'number') {
      base.penaltyRepeat = options.repeat_penalty;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'frequency_penalty') && typeof options.frequency_penalty === 'number') {
      base.penaltyFreq = options.frequency_penalty;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'presence_penalty') && typeof options.presence_penalty === 'number') {
      base.penaltyPresent = options.presence_penalty;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'penalty_last_n') && typeof options.penalty_last_n === 'number') {
      base.penaltyLastN = options.penalty_last_n;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'mirostat') && typeof options.mirostat === 'number') {
      base.mirostat = options.mirostat;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'mirostat_tau') && typeof options.mirostat_tau === 'number') {
      base.mirostatTau = options.mirostat_tau;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'mirostat_eta') && typeof options.mirostat_eta === 'number') {
      base.mirostatEta = options.mirostat_eta;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'typical_p') && typeof options.typical_p === 'number') {
      base.typicalP = options.typical_p;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'n_probs') && typeof options.n_probs === 'number') {
      base.nProbs = options.n_probs;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'dry_multiplier') && typeof options.dry_multiplier === 'number') {
      base.dryMultiplier = options.dry_multiplier;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'dry_base') && typeof options.dry_base === 'number') {
      base.dryBase = options.dry_base;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'dry_allowed_length') && typeof options.dry_allowed_length === 'number') {
      base.dryAllowedLength = options.dry_allowed_length;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'dry_penalty_last_n') && typeof options.dry_penalty_last_n === 'number') {
      base.dryPenaltyLastN = options.dry_penalty_last_n;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'dry_sequence_breakers') && Array.isArray(options.dry_sequence_breakers)) {
      base.drySequenceBreakers = options.dry_sequence_breakers.filter((item: any) => typeof item === 'string');
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'ignore_eos') && typeof options.ignore_eos === 'boolean') {
      base.ignoreEos = options.ignore_eos;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'enable_thinking') && typeof options.enable_thinking === 'boolean') {
      base.enableThinking = options.enable_thinking;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'xtc_probability') && typeof options.xtc_probability === 'number') {
      base.xtcProbability = options.xtc_probability;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'xtc_threshold') && typeof options.xtc_threshold === 'number') {
      base.xtcThreshold = options.xtc_threshold;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'jinja') && typeof options.jinja === 'boolean') {
      base.jinja = options.jinja;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'grammar') && typeof options.grammar === 'string') {
      base.grammar = options.grammar;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'system_prompt') && typeof options.system_prompt === 'string') {
      base.systemPrompt = options.system_prompt;
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'stop') && Array.isArray(options.stop)) {
      const words = options.stop.filter((item: any) => typeof item === 'string');
      if (words.length > 0) {
        base.stopWords = words;
        changed = true;
      }
    } else if (Object.prototype.hasOwnProperty.call(options, 'stop') && typeof options.stop === 'string') {
      base.stopWords = [options.stop];
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'stop_words') && Array.isArray(options.stop_words)) {
      const words = options.stop_words.filter((item: any) => typeof item === 'string');
      if (words.length > 0) {
        base.stopWords = words;
        changed = true;
      }
    } else if (Object.prototype.hasOwnProperty.call(options, 'stop_words') && typeof options.stop_words === 'string') {
      base.stopWords = [options.stop_words];
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'logit_bias') && Array.isArray(options.logit_bias)) {
      base.logitBias = options.logit_bias;
      changed = true;
    }

    return changed ? base : undefined;
  }

  private sendChunkedResponseStart(socket: any, status: number, headers: Record<string, string>): void {
    const statusText = this.getStatusText(status);
    const mergedHeaders: Record<string, string> = {
      'Transfer-Encoding': 'chunked',
      'Connection': 'close',
      'Access-Control-Allow-Origin': '*',
      ...headers,
    };

    const headerLines = Object.entries(mergedHeaders)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');

    const response = `HTTP/1.1 ${status} ${statusText}\r\n${headerLines}\r\n\r\n`;
    socket.write(response);
  }

  private writeChunk(socket: any, payload: any): void {
    const body = JSON.stringify(payload) + '\n';
    const size = Buffer.byteLength(body, 'utf8').toString(16);
    const chunk = `${size}\r\n${body}\r\n`;
    socket.write(chunk);
  }

  private endChunkedResponse(socket: any): void {
    socket.write('0\r\n\r\n');
    socket.end();
  }

  private async streamChatResponse(
    socket: any,
    method: string,
    path: string,
    model: StoredModel,
    messages: Array<{ role: string; content: string }>,
    settings?: ModelSettings
  ): Promise<void> {
    try {
      this.sendChunkedResponseStart(socket, 200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
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
            this.writeChunk(socket, {
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

      this.writeChunk(socket, {
        model: model.name,
        created_at: new Date().toISOString(),
        response: '',
        done: true,
        total_duration_ms: duration,
        output: full
      });

      this.endChunkedResponse(socket);
      logger.logWebRequest(method, path, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'generation_failed';
      try {
        this.writeChunk(socket, {
          model: model.name,
          created_at: new Date().toISOString(),
          error: message,
          done: true
        });
        this.endChunkedResponse(socket);
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
  }

  private async getFileSize(path: string | null): Promise<number> {
    if (!path) {
      return 0;
    }

    try {
      const info = await FileSystem.getInfoAsync(path, { size: true });
      if (info?.exists) {
        const size = (info as any).size;
        return typeof size === 'number' ? size : 0;
      }
    } catch (error) {
    }

    return 0;
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

    if (method === 'POST' && path === '/api/chat') {
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

      if (!payload || !Array.isArray(payload.messages)) {
        this.sendJSONResponse(socket, 400, { error: 'messages_required' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      const messages: Array<{ role: string; content: string }> = [];
      const systemInputs: string[] = [];

      if (payload.options && typeof payload.options.system_prompt === 'string' && payload.options.system_prompt.length > 0) {
        systemInputs.push(payload.options.system_prompt);
      }

      if (typeof payload.system === 'string' && payload.system.length > 0) {
        systemInputs.push(payload.system);
      }

      for (const entry of payload.messages) {
        if (!entry || typeof entry.role !== 'string') {
          continue;
        }

        let content = '';

        if (typeof entry.content === 'string') {
          content = entry.content;
        } else if (Array.isArray(entry.content)) {
          content = entry.content
            .map((item: any) => {
              if (typeof item === 'string') {
                return item;
              }
              if (item && typeof item.text === 'string') {
                return item.text;
              }
              return '';
            })
            .filter((value: string) => value.length > 0)
            .join(' ');
        } else if (entry.content && typeof entry.content === 'object' && typeof entry.content.text === 'string') {
          content = entry.content.text;
        } else if (entry.content !== undefined && entry.content !== null) {
          content = String(entry.content);
        }

        messages.push({ role: entry.role, content });
      }

      for (let index = systemInputs.length - 1; index >= 0; index -= 1) {
        const systemContent = systemInputs[index];
        messages.unshift({ role: 'system', content: systemContent });
      }

      if (messages.length === 0) {
        this.sendJSONResponse(socket, 400, { error: 'messages_required' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      const modelIdentifier = typeof payload.model === 'string' ? payload.model : undefined;
      const stream = payload.stream === true;
      const settings = this.buildCustomSettings(payload.options);

      let target: { model: StoredModel; projectorPath?: string };

      try {
        target = await this.ensureModelLoaded(modelIdentifier);
      } catch (error) {
        const parsed = this.parseHttpError(error);
        const safeMessage = parsed.message.replace(/\s+/g, '_');
        logger.error(`api_chat_model:${safeMessage}`, 'webrtc');
        this.sendJSONResponse(socket, parsed.status, { error: parsed.code });
        logger.logWebRequest(method, path, parsed.status);
        return;
      }

      if (stream) {
        await this.streamChatResponse(socket, method, path, target.model, messages, settings);
        return;
      }

      try {
        const responseText = await llamaManager.generateResponse(messages, undefined, settings);
        this.sendJSONResponse(socket, 200, {
          model: target.model.name,
          created_at: new Date().toISOString(),
          response: responseText,
          done: true
        });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'generation_failed';
        const safeMessage = message.replace(/\s+/g, '_');
        logger.error(`api_chat_failed:${safeMessage}`, 'webrtc');
        this.sendJSONResponse(socket, 500, { error: 'generation_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return;
    }

    if (method === 'POST' && path === '/api/generate') {
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

      const messages: Array<{ role: string; content: string }> = [];
      const systemInputs: string[] = [];

      if (typeof payload.system === 'string' && payload.system.length > 0) {
        systemInputs.push(payload.system);
      }

      if (payload.options && typeof payload.options.system_prompt === 'string' && payload.options.system_prompt.length > 0) {
        systemInputs.push(payload.options.system_prompt);
      }

      if (Array.isArray(payload.messages) && payload.messages.length > 0) {
        for (const entry of payload.messages) {
          if (!entry || typeof entry.role !== 'string') {
            continue;
          }

          let content = '';

          if (typeof entry.content === 'string') {
            content = entry.content;
          } else if (Array.isArray(entry.content)) {
            content = entry.content
              .map((item: any) => {
                if (typeof item === 'string') {
                  return item;
                }
                if (item && typeof item.text === 'string') {
                  return item.text;
                }
                return '';
              })
              .filter((value: string) => value.length > 0)
              .join(' ');
          } else if (entry.content && typeof entry.content === 'object' && typeof entry.content.text === 'string') {
            content = entry.content.text;
          } else if (entry.content !== undefined && entry.content !== null) {
            content = String(entry.content);
          }

          messages.push({ role: entry.role, content });
        }
      } else if (typeof payload.prompt === 'string') {
        messages.push({ role: 'user', content: payload.prompt });
      }

      for (let index = systemInputs.length - 1; index >= 0; index -= 1) {
        const systemContent = systemInputs[index];
        messages.unshift({ role: 'system', content: systemContent });
      }

      if (messages.length === 0) {
        this.sendJSONResponse(socket, 400, { error: 'prompt_required' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      const modelIdentifier = typeof payload.model === 'string' ? payload.model : undefined;
      const stream = payload.stream === true;
      const settings = this.buildCustomSettings(payload.options);

      let target: { model: StoredModel; projectorPath?: string };

      try {
        target = await this.ensureModelLoaded(modelIdentifier);
      } catch (error) {
        const parsed = this.parseHttpError(error);
        const safeMessage = parsed.message.replace(/\s+/g, '_');
        logger.error(`api_generate_model:${safeMessage}`, 'webrtc');
        this.sendJSONResponse(socket, parsed.status, { error: parsed.code });
        logger.logWebRequest(method, path, parsed.status);
        return;
      }

      if (stream) {
        await this.streamChatResponse(socket, method, path, target.model, messages, settings);
        return;
      }

      try {
        const responseText = await llamaManager.generateResponse(messages, undefined, settings);
        this.sendJSONResponse(socket, 200, {
          model: target.model.name,
          created_at: new Date().toISOString(),
          response: responseText,
          done: true
        });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'generation_failed';
        const safeMessage = message.replace(/\s+/g, '_');
        logger.error(`api_generate_failed:${safeMessage}`, 'webrtc');
        this.sendJSONResponse(socket, 500, { error: 'generation_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return;
    }

    if (method === 'POST' && path === '/api/show') {
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

      const identifier = typeof payload?.name === 'string' && payload.name.length > 0
        ? payload.name
        : typeof payload?.model === 'string' && payload.model.length > 0
          ? payload.model
          : typeof payload?.path === 'string' && payload.path.length > 0
            ? payload.path
            : null;

      if (!identifier) {
        this.sendJSONResponse(socket, 400, { error: 'model_required' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      try {
        const models = await modelDownloader.getStoredModels();
        const target = this.findStoredModel(identifier, models);

        if (!target) {
          this.sendJSONResponse(socket, 404, { error: 'model_not_found' });
          logger.logWebRequest(method, path, 404);
          return;
        }

        let info: any = {};
        try {
          info = await loadLlamaModelInfo(target.path);
        } catch (error) {
          info = {};
        }

        const settingsConfig = await modelSettingsService.getModelSettings(target.path);

        this.sendJSONResponse(socket, 200, {
          name: target.name,
          path: target.path,
          size: target.size,
          modified_at: target.modified,
          is_external: target.isExternal === true,
          model_type: target.modelType || null,
          capabilities: target.capabilities || [],
          multimodal: target.supportsMultimodal === true,
          default_projection_model: target.defaultProjectionModel || null,
          settings: settingsConfig,
          info
        });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'model_info_failed';
        const safeMessage = message.replace(/\s+/g, '_');
        logger.error(`api_show_failed:${safeMessage}`, 'webrtc');
        this.sendJSONResponse(socket, 500, { error: 'model_info_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return;
    }

    if (method === 'POST' && path === '/api/embeddings') {
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

      const identifier = typeof payload.model === 'string' ? payload.model : undefined;
      const input = payload.input ?? payload.prompt ?? payload.text;

      let inputs: string[] = [];

      if (typeof input === 'string') {
        inputs = [input];
      } else if (Array.isArray(input)) {
        inputs = input.filter((item: any) => typeof item === 'string');
      }

      if (inputs.length === 0) {
        this.sendJSONResponse(socket, 400, { error: 'input_required' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      let target: { model: StoredModel; projectorPath?: string };

      try {
        target = await this.ensureModelLoaded(identifier);
      } catch (error) {
        const parsed = this.parseHttpError(error);
        const safeMessage = parsed.message.replace(/\s+/g, '_');
        logger.error(`api_embeddings_model:${safeMessage}`, 'webrtc');
        this.sendJSONResponse(socket, parsed.status, { error: parsed.code });
        logger.logWebRequest(method, path, parsed.status);
        return;
      }

      try {
        const vectors: number[][] = [];

        for (const text of inputs) {
          const vector = await llamaManager.generateEmbedding(text);
          vectors.push(vector);
        }

        if (vectors.length === 1) {
          this.sendJSONResponse(socket, 200, {
            model: target.model.name,
            created_at: new Date().toISOString(),
            embedding: vectors[0]
          });
        } else {
          this.sendJSONResponse(socket, 200, {
            model: target.model.name,
            created_at: new Date().toISOString(),
            embeddings: vectors
          });
        }
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'embedding_failed';
        const safeMessage = message.replace(/\s+/g, '_');
        logger.error(`api_embeddings_failed:${safeMessage}`, 'webrtc');
        this.sendJSONResponse(socket, 500, { error: 'embedding_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return;
    }

    if (method === 'GET' && path === '/api/ps') {
      try {
        const items: any[] = [];

        if (llamaManager.isInitialized()) {
          const currentPath = llamaManager.getModelPath();
          const models = await modelDownloader.getStoredModels();
          const target = currentPath ? this.findStoredModel(currentPath, models) : null;
          const name = target?.name || this.activeModel?.name || (currentPath ? currentPath.split('/').pop() || 'model' : 'model');
          const size = target?.size || await this.getFileSize(currentPath);
          const started = this.activeModel?.startedAt || new Date().toISOString();

          items.push({
            name,
            model: target?.path || currentPath,
            size,
            is_external: target?.isExternal === true,
            model_type: target?.modelType || null,
            loaded_at: started
          });
        }

        this.sendJSONResponse(socket, 200, { models: items });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'ps_failed';
        const safeMessage = message.replace(/\s+/g, '_');
        logger.error(`api_ps_failed:${safeMessage}`, 'webrtc');
        this.sendJSONResponse(socket, 500, { error: 'ps_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return;
    }

    if (method === 'POST' && path === '/api/copy') {
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

      const sourceIdentifier = typeof payload?.source === 'string' && payload.source.length > 0
        ? payload.source
        : typeof payload?.name === 'string' && payload.name.length > 0
          ? payload.name
          : typeof payload?.model === 'string' && payload.model.length > 0
            ? payload.model
            : null;

      const destinationName = typeof payload?.destination === 'string' && payload.destination.length > 0
        ? payload.destination
        : typeof payload?.target === 'string' && payload.target.length > 0
          ? payload.target
          : null;

      if (!sourceIdentifier || !destinationName) {
        this.sendJSONResponse(socket, 400, { error: 'missing_parameters' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      if (destinationName.includes('/') || destinationName.includes('..')) {
        this.sendJSONResponse(socket, 400, { error: 'invalid_destination' });
        logger.logWebRequest(method, path, 400);
        return;
      }

      try {
        const models = await modelDownloader.getStoredModels();
        const source = this.findStoredModel(sourceIdentifier, models);

        if (!source) {
          this.sendJSONResponse(socket, 404, { error: 'model_not_found' });
          logger.logWebRequest(method, path, 404);
          return;
        }

        if (source.isExternal) {
          this.sendJSONResponse(socket, 400, { error: 'unsupported_source' });
          logger.logWebRequest(method, path, 400);
          return;
        }

  const slashIndex = source.path.lastIndexOf('/');
  const destDir = slashIndex === -1 ? '' : source.path.slice(0, slashIndex);
  const destPath = destDir.length > 0 ? `${destDir}/${destinationName}` : destinationName;

        const existing = await FileSystem.getInfoAsync(destPath);
        if (existing.exists) {
          this.sendJSONResponse(socket, 409, { error: 'destination_exists' });
          logger.logWebRequest(method, path, 409);
          return;
        }

        await FileSystem.copyAsync({ from: source.path, to: destPath });
        await modelDownloader.refreshStoredModels();

        this.sendJSONResponse(socket, 200, {
          status: 'copied',
          source: source.name,
          destination: destinationName
        });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'copy_failed';
        const safeMessage = message.replace(/\s+/g, '_');
        logger.error(`api_copy_failed:${safeMessage}`, 'webrtc');
        this.sendJSONResponse(socket, 500, { error: 'copy_failed' });
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
