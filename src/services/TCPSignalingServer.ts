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
import chatManager, { type Chat } from '../utils/ChatManager';
import { RAGService } from './rag/RAGService';
import type { ProviderType } from './ModelManagementService';
import { appleFoundationService } from './AppleFoundationService';
import { onlineModelService } from './OnlineModelService';
import apiKeyDatabase from '../utils/ApiKeyDatabase';
import { Platform } from 'react-native';

type RemoteProvider = Exclude<ProviderType, 'local' | 'apple-foundation'>;
type RemoteProviderState = {
  provider: RemoteProvider;
  configured: boolean;
  model: string | null;
  usingDefault: boolean;
};

const REMOTE_PROVIDERS: RemoteProvider[] = ['gemini', 'chatgpt', 'deepseek', 'claude'];
const REMOTE_MODELS_PREF_KEY = 'remote_models_enabled';

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
      const bodyContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inferra Local Server API</title>
</head>
<body>
  <h1>Inferra Local Server</h1>
  <p>AI Model REST API & WebRTC Signaling</p>
  <p>Version ${this.getAppVersion()} | Status: Running</p>

  <h2>Base URL</h2>
  <p>Replace &lt;host&gt; in the examples below with your device IP and port.</p>
  <p>Current address: http://${this.localIP}:${this.port}</p>

  <h2>REST API Endpoints</h2>

  <h3>GET /api/tags</h3>
  <p>Lists all installed models with metadata including name, size, type, and capabilities.</p>
  <p>Example:</p>
  <pre>curl -X GET http://&lt;host&gt;:11434/api/tags</pre>

  <h3>GET /api/status</h3>
  <p>Returns server health, active model details, and RAG readiness.</p>
  <p>Example:</p>
  <pre>curl -X GET http://&lt;host&gt;:11434/api/status</pre>

  <h3>POST /api/pull</h3>
  <p>Downloads a model from a supplied URL or remote registry.</p>
  <p>Request Body:</p>
  <pre>{"url":"https://...","model":"model-name"}</pre>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/api/pull -H "Content-Type: application/json" -d '{"url":"https://huggingface.co/...","model":"example"}'</pre>

  <h3>DELETE /api/delete</h3>
  <p>Removes an installed model by name.</p>
  <p>Request Body:</p>
  <pre>{"name":"model-name"}</pre>
  <p>Example:</p>
  <pre>curl -X DELETE http://&lt;host&gt;:11434/api/delete -H "Content-Type: application/json" -d '{"name":"example"}'</pre>

  <h3>GET /api/ps</h3>
  <p>Displays the model currently loaded into memory with details.</p>
  <p>Example:</p>
  <pre>curl -X GET http://&lt;host&gt;:11434/api/ps</pre>

  <h3>POST /api/models</h3>
  <p>Controls the active model. Supported actions: <code>load</code>, <code>unload</code>, <code>reload</code>.</p>
  <p>Request Body:</p>
  <pre>{"action":"load","model":"ModelName.gguf"}</pre>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/api/models -H "Content-Type: application/json" -d '{"action":"unload"}'</pre>

  <h3>GET /api/chats</h3>
  <p>Lists stored conversations with summary metadata.</p>
  <p>Example:</p>
  <pre>curl -X GET http://&lt;host&gt;:11434/api/chats</pre>

  <h3>POST /api/chats</h3>
  <p>Creates a new chat with optional title and seed messages.</p>
  <p>Request Body:</p>
  <pre>{"title":"Brainstorm","messages":[{"role":"user","content":"Hello"}]}</pre>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/api/chats -H "Content-Type: application/json" -d '{"title":"New Chat"}'</pre>

  <h3>GET /api/chats/&lt;chatId&gt;</h3>
  <p>Returns chat metadata and all messages.</p>
  <p>Example:</p>
  <pre>curl -X GET http://&lt;host&gt;:11434/api/chats/123</pre>

  <h3>DELETE /api/chats/&lt;chatId&gt;</h3>
  <p>Removes a chat and its messages.</p>
  <p>Example:</p>
  <pre>curl -X DELETE http://&lt;host&gt;:11434/api/chats/123</pre>

  <h3>GET /api/chats/&lt;chatId&gt;/messages</h3>
  <p>Lists messages for a chat in chronological order.</p>
  <p>Example:</p>
  <pre>curl -X GET http://&lt;host&gt;:11434/api/chats/123/messages</pre>

  <h3>POST /api/chats/&lt;chatId&gt;/messages</h3>
  <p>Appends one or more messages to an existing chat.</p>
  <p>Request Body:</p>
  <pre>{"messages":[{"role":"assistant","content":"Hi!"}]}</pre>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/api/chats/123/messages -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"Next step?"}]}'</pre>

  <h3>PUT /api/chats/&lt;chatId&gt;/messages/&lt;messageId&gt;</h3>
  <p>Updates message content, role, thinking traces, or stats.</p>
  <p>Example:</p>
  <pre>curl -X PUT http://&lt;host&gt;:11434/api/chats/123/messages/abc -H "Content-Type: application/json" -d '{"content":"Edited"}'</pre>

  <h3>DELETE /api/chats/&lt;chatId&gt;/messages/&lt;messageId&gt;</h3>
  <p>Deletes a single message from a chat.</p>
  <p>Example:</p>
  <pre>curl -X DELETE http://&lt;host&gt;:11434/api/chats/123/messages/abc</pre>

  <h3>POST /api/chats/&lt;chatId&gt;/title</h3>
  <p>Sets a custom title or auto-generates one from the first user prompt.</p>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/api/chats/123/title -H "Content-Type: application/json" -d '{"prompt":"Summarize research notes"}'</pre>

  <h3>POST /api/chats/&lt;chatId&gt;/model</h3>
  <p>Associates a chat with a model path or clears the link.</p>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/api/chats/123/model -H "Content-Type: application/json" -d '{"path":"models/llama.gguf"}'</pre>

  <h3>POST /api/files/ingest</h3>
  <p>Stores file contents in the Retrieval-Augmented Generation index when enabled.</p>
  <p>Request Body:</p>
  <pre>{"fileName":"notes.txt","content":"...","provider":"local","rag":true}</pre>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/api/files/ingest -H "Content-Type: application/json" -d '{"fileName":"doc.md","content":"# Notes"}'</pre>

  <h3>GET /api/rag</h3>
  <p>Shows retrieval status, storage mode, and readiness.</p>
  <p>Example:</p>
  <pre>curl -X GET http://&lt;host&gt;:11434/api/rag</pre>

  <h3>POST /api/rag</h3>
  <p>Updates RAG enablement, storage strategy, provider, and optional initialization.</p>
  <p>Request Body:</p>
  <pre>{"enabled":true,"storage":"persistent","provider":"local","initialize":true}</pre>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/api/rag -H "Content-Type: application/json" -d '{"enabled":false}'</pre>

  <h3>POST /api/rag/reset</h3>
  <p>Clears the vector store and reinitializes retrieval.</p>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/api/rag/reset</pre>

  <h3>POST /api/settings/thinking</h3>
  <p>Toggles local model thinking mode (chain-of-thought) on or off.</p>
  <p>Request Body:</p>
  <pre>{"enabled":true}</pre>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/api/settings/thinking -H "Content-Type: application/json" -d '{"enabled":false}'</pre>

  <h3>POST /api/chat</h3>
  <p>Streams chat completions using a messages array. Supports streaming and non-streaming modes.</p>
  <p>Request Body:</p>
  <pre>{"messages":[{"role":"user","content":"Hello"}],"stream":true}</pre>
  <p>Example (Streaming):</p>
  <pre>curl -N -X POST http://&lt;host&gt;:11434/api/chat -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"Hello"}],"stream":true}'</pre>

  <h3>POST /api/generate</h3>
  <p>Generates a single completion from a prompt or messages array.</p>
  <p>Request Body:</p>
  <pre>{"prompt":"Write a haiku."}</pre>
  <p>Example:</p>
  <pre>curl -N -X POST http://&lt;host&gt;:11434/api/generate -H "Content-Type: application/json" -d '{"prompt":"Hello"}'</pre>

  <h3>POST /api/embeddings</h3>
  <p>Returns vector embeddings when supported by the loaded model.</p>
  <p>Request Body:</p>
  <pre>{"input":"Vector me"}</pre>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/api/embeddings -H "Content-Type: application/json" -d '{"input":"Example"}'</pre>

  <h3>POST /api/copy</h3>
  <p>Copies an existing model file to a new name.</p>
  <p>Request Body:</p>
  <pre>{"source":"model.gguf","destination":"model-copy"}</pre>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/api/copy -H "Content-Type: application/json" -d '{"source":"model.gguf","destination":"duplicate"}'</pre>

  <h3>POST /api/show</h3>
  <p>Returns detailed information about a specific model including settings and capabilities.</p>
  <p>Request Body:</p>
  <pre>{"name":"model-name"}</pre>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/api/show -H "Content-Type: application/json" -d '{"name":"example"}'</pre>

  <h3>GET /api/version</h3>
  <p>Returns the Inferra local server version.</p>
  <p>Example:</p>
  <pre>curl -X GET http://&lt;host&gt;:11434/api/version</pre>

  <h2>WebRTC Signaling Endpoints</h2>

  <h3>GET /offer</h3>
  <p>Provides the current WebRTC offer for manual pairing.</p>
  <p>Example:</p>
  <pre>curl -X GET http://&lt;host&gt;:11434/offer</pre>

  <h3>POST /webrtc/answer</h3>
  <p>Accepts a WebRTC answer payload when pairing manually.</p>
  <p>Request Body:</p>
  <pre>{"peerId":"...","sdp":"..."}</pre>
  <p>Example:</p>
  <pre>curl -X POST http://&lt;host&gt;:11434/webrtc/answer -H "Content-Type: application/json" -d '{"peerId":"browser","sdp":"..."}'</pre>

  <h3>Pairing Overview</h3>
  <ul>
    <li>Browser clients request /offer to receive the SDP when automatic pairing fails.</li>
    <li>After creating an answer locally, POST it to /webrtc/answer with the same peerId returned alongside the offer.</li>
    <li>Once accepted, the HTTP REST endpoints operate over the established data channel connection.</li>
  </ul>

  <h2>Advanced Options</h2>
  <p>Most endpoints support additional parameters for fine-tuning model behavior:</p>
  <pre>{
  "temperature": 0.7,
  "top_p": 0.9,
  "top_k": 40,
  "min_p": 0.05,
  "num_predict": 128,
  "seed": 42,
  "repeat_penalty": 1.1,
  "frequency_penalty": 0.0,
  "presence_penalty": 0.0,
  "penalty_last_n": 64,
  "mirostat": 0,
  "mirostat_tau": 5.0,
  "mirostat_eta": 0.1,
  "typical_p": 1.0,
  "n_probs": 0,
  "ignore_eos": false,
  "enable_thinking": false,
  "xtc_probability": 0.0,
  "xtc_threshold": 0.1,
  "grammar": "",
  "system_prompt": "",
  "stop": [],
  "stop_words": [],
  "logit_bias": []
}</pre>

  <hr>
  <p>Inferra Local Server &copy; 2025 | Version ${this.getAppVersion()}</p>
  <p>For more information, visit the <a href="/offer">WebRTC offer endpoint</a></p>
</body>
</html>`;
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
        return await this.handleChatApi(method, segments.slice(2), body, socket, path);
      case 'files':
        return await this.handleFileApi(method, segments.slice(2), body, socket, path);
      case 'rag':
        return await this.handleRagApi(method, segments.slice(2), body, socket, path);
      case 'status':
        return await this.handleServerStatusApi(method, socket, path);
      case 'models':
        return await this.handleModelApi(method, segments.slice(2), body, socket, path);
      case 'settings':
        return await this.handleSettingsApi(method, segments.slice(2), body, socket, path);
      default:
        return false;
    }
  }

  private async handleChatApi(
    method: string,
    segments: string[],
    body: string,
    socket: any,
    path: string
  ): Promise<boolean> {
    if (segments.length === 0) {
      if (method === 'GET') {
        try {
          await chatManager.ensureInitialized();
          const chats = chatManager.getAllChats();
          this.sendJSONResponse(socket, 200, { chats: chats.map(chat => this.serializeChat(chat, false)) });
          logger.logWebRequest(method, `/api/chats`, 200);
        } catch (error) {
          this.sendJSONResponse(socket, 500, { error: 'chat_list_failed' });
          logger.logWebRequest(method, `/api/chats`, 500);
        }
        return true;
      }

      if (method === 'POST') {
        if (!body) {
          this.sendJSONResponse(socket, 400, { error: 'empty_body' });
          logger.logWebRequest(method, `/api/chats`, 400);
          return true;
        }

        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch (error) {
          this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
          logger.logWebRequest(method, `/api/chats`, 400);
          return true;
        }

        const title = typeof payload?.title === 'string' && payload.title.length > 0 ? payload.title : undefined;
        const initialMessages = Array.isArray(payload?.messages) ? payload.messages : [];
        const preparedMessages = initialMessages
          .filter((entry: any) => entry && typeof entry.content === 'string')
          .map((entry: any) => ({
            id: typeof entry.id === 'string' ? entry.id : undefined,
            role: typeof entry.role === 'string' ? entry.role : 'user',
            content: entry.content,
            thinking: typeof entry.thinking === 'string' ? entry.thinking : undefined,
            stats: typeof entry.stats === 'object' ? entry.stats : undefined,
          }));

        try {
          await chatManager.ensureInitialized();
          const chat = await chatManager.createNewChat();
          if (preparedMessages.length > 0) {
            await chatManager.appendMessages(chat.id, preparedMessages);
          }
          const updated = chatManager.getChatById(chat.id) || chat;
          if (title) {
            await chatManager.setChatTitle(chat.id, title);
          }
          this.sendJSONResponse(socket, 201, { chat: this.serializeChat(updated, true) });
          logger.logWebRequest(method, `/api/chats`, 201);
        } catch (error) {
          this.sendJSONResponse(socket, 500, { error: 'chat_create_failed' });
          logger.logWebRequest(method, `/api/chats`, 500);
        }
        return true;
      }

      this.sendJSONResponse(socket, 405, { error: 'method_not_allowed' });
      logger.logWebRequest(method, `/api/chats`, 405);
      return true;
    }

    const chatId = segments[0];
    const subresource = segments[1] || '';

    if (method === 'GET' && !subresource) {
      try {
        await chatManager.ensureInitialized();
        const chat = chatManager.getChatById(chatId);
        if (!chat) {
          this.sendJSONResponse(socket, 404, { error: 'chat_not_found' });
          logger.logWebRequest(method, path, 404);
          return true;
        }

        this.sendJSONResponse(socket, 200, { chat: this.serializeChat(chat, true) });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        this.sendJSONResponse(socket, 500, { error: 'chat_load_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    if (method === 'DELETE' && !subresource) {
      try {
        await chatManager.ensureInitialized();
        const result = await chatManager.deleteChat(chatId);
        if (!result) {
          this.sendJSONResponse(socket, 404, { error: 'chat_not_found' });
          logger.logWebRequest(method, path, 404);
          return true;
        }

        this.sendJSONResponse(socket, 200, { status: 'deleted', chatId });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        this.sendJSONResponse(socket, 500, { error: 'chat_delete_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    if (subresource === 'messages') {
      if (method === 'GET') {
        try {
          await chatManager.ensureInitialized();
          const chat = chatManager.getChatById(chatId);
          if (!chat) {
            this.sendJSONResponse(socket, 404, { error: 'chat_not_found' });
            logger.logWebRequest(method, path, 404);
            return true;
          }

          this.sendJSONResponse(socket, 200, { messages: chat.messages });
          logger.logWebRequest(method, path, 200);
        } catch (error) {
          this.sendJSONResponse(socket, 500, { error: 'chat_messages_failed' });
          logger.logWebRequest(method, path, 500);
        }
        return true;
      }

      if (method === 'POST') {
        if (!body) {
          this.sendJSONResponse(socket, 400, { error: 'empty_body' });
          logger.logWebRequest(method, path, 400);
          return true;
        }

        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch (error) {
          this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
          logger.logWebRequest(method, path, 400);
          return true;
        }

        const entries = Array.isArray(payload?.messages) ? payload.messages : Array.isArray(payload) ? payload : [payload];

        try {
          const created = await chatManager.appendMessages(
            chatId,
            entries.map((item: any) => ({
              id: typeof item?.id === 'string' ? item.id : undefined,
              role: typeof item?.role === 'string' ? item.role : 'user',
              content: typeof item?.content === 'string' ? item.content : '',
              thinking: typeof item?.thinking === 'string' ? item.thinking : undefined,
              stats: typeof item?.stats === 'object' ? item.stats : undefined,
            }))
          );

          this.sendJSONResponse(socket, 201, { messages: created });
          logger.logWebRequest(method, path, 201);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'chat_message_append_failed';
          if (message === 'chat_not_found') {
            this.sendJSONResponse(socket, 404, { error: 'chat_not_found' });
            logger.logWebRequest(method, path, 404);
          } else {
            this.sendJSONResponse(socket, 500, { error: 'chat_message_append_failed' });
            logger.logWebRequest(method, path, 500);
          }
        }
        return true;
      }

      if (segments.length >= 3) {
        const messageId = segments[2];

        if (method === 'PUT') {
          if (!body) {
            this.sendJSONResponse(socket, 400, { error: 'empty_body' });
            logger.logWebRequest(method, path, 400);
            return true;
          }

          let payload: any;
          try {
            payload = JSON.parse(body);
          } catch (error) {
            this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
            logger.logWebRequest(method, path, 400);
            return true;
          }

          const updates = typeof payload === 'object' && payload ? payload : {};

          const result = await chatManager.updateMessageById(chatId, messageId, {
            content: typeof updates.content === 'string' ? updates.content : undefined,
            thinking: typeof updates.thinking === 'string' ? updates.thinking : updates.thinking === null ? null : undefined,
            stats: typeof updates.stats === 'object' ? updates.stats : updates.stats === null ? null : undefined,
            role: typeof updates.role === 'string' ? updates.role : undefined,
          });

          if (!result) {
            this.sendJSONResponse(socket, 404, { error: 'message_not_found' });
            logger.logWebRequest(method, path, 404);
            return true;
          }

          this.sendJSONResponse(socket, 200, { status: 'updated', chatId, messageId });
          logger.logWebRequest(method, path, 200);
          return true;
        }

        if (method === 'DELETE') {
          try {
            const result = await chatManager.removeMessage(chatId, messageId);
            if (!result) {
              this.sendJSONResponse(socket, 404, { error: 'message_not_found' });
              logger.logWebRequest(method, path, 404);
              return true;
            }

            this.sendJSONResponse(socket, 200, { status: 'deleted', chatId, messageId });
            logger.logWebRequest(method, path, 200);
          } catch (error) {
            this.sendJSONResponse(socket, 500, { error: 'message_delete_failed' });
            logger.logWebRequest(method, path, 500);
          }
          return true;
        }
      }
    }

    if (subresource === 'title' && method === 'POST') {
      if (!body) {
        this.sendJSONResponse(socket, 400, { error: 'empty_body' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      const title = typeof payload?.title === 'string' && payload.title.length > 0 ? payload.title : undefined;
      const prompt = typeof payload?.prompt === 'string' && payload.prompt.length > 0 ? payload.prompt : undefined;

      try {
        await chatManager.ensureInitialized();
        const chat = chatManager.getChatById(chatId);
        if (!chat) {
          this.sendJSONResponse(socket, 404, { error: 'chat_not_found' });
          logger.logWebRequest(method, path, 404);
          return true;
        }

        if (title) {
          await chatManager.setChatTitle(chatId, title);
          this.sendJSONResponse(socket, 200, { title, generated: false });
          logger.logWebRequest(method, path, 200);
          return true;
        }

        const generated = await chatManager.generateTitleForChat(chatId, prompt);
        if (!generated) {
          this.sendJSONResponse(socket, 422, { error: 'title_generation_failed' });
          logger.logWebRequest(method, path, 422);
          return true;
        }

        this.sendJSONResponse(socket, 200, { title: generated, generated: true });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        this.sendJSONResponse(socket, 500, { error: 'title_update_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    if (subresource === 'model' && method === 'POST') {
      if (!body) {
        this.sendJSONResponse(socket, 400, { error: 'empty_body' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      const modelPath = typeof payload?.path === 'string' && payload.path.length > 0 ? payload.path : null;

      try {
        const updated = await chatManager.setChatModelPath(chatId, modelPath);
        if (!updated) {
          this.sendJSONResponse(socket, 404, { error: 'chat_not_found' });
          logger.logWebRequest(method, path, 404);
          return true;
        }

        this.sendJSONResponse(socket, 200, { status: 'updated', chatId, modelPath });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        this.sendJSONResponse(socket, 500, { error: 'chat_model_update_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    return false;
  }

  private serializeChat(chat: Chat, includeMessages: boolean): any {
    return {
      id: chat.id,
      title: chat.title,
      timestamp: chat.timestamp,
      modelPath: chat.modelPath ?? null,
      messageCount: chat.messages.length,
      ...(includeMessages ? { messages: chat.messages } : {}),
    };
  }

  private async handleFileApi(
    method: string,
    segments: string[],
    body: string,
    socket: any,
    path: string
  ): Promise<boolean> {
    if (method === 'POST' && segments[0] === 'ingest') {
      if (!body) {
        this.sendJSONResponse(socket, 400, { error: 'empty_body' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      const content = typeof payload?.content === 'string' ? payload.content : null;
      const fileName = typeof payload?.fileName === 'string' ? payload.fileName : 'uploaded.txt';
      const model = typeof payload?.model === 'string' ? payload.model : undefined;
      const provider = this.normalizeProvider(payload?.provider);
      const useRag = payload?.rag !== false;

      if (!content) {
        this.sendJSONResponse(socket, 400, { error: 'content_required' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      try {
        if (!useRag) {
          this.sendJSONResponse(socket, 200, {
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
          this.sendJSONResponse(socket, 503, { error: 'rag_not_ready' });
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

        this.sendJSONResponse(socket, 200, {
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
        this.sendJSONResponse(socket, 500, { error: 'rag_ingest_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    return false;
  }

  private normalizeProvider(value: any): ProviderType | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.toLowerCase();

    if (
      normalized === 'gemini' ||
      normalized === 'chatgpt' ||
      normalized === 'deepseek' ||
      normalized === 'claude' ||
      normalized === 'apple-foundation'
    ) {
      return normalized;
    }

    if (normalized === 'local' || normalized === 'llama') {
      return 'local';
    }

    return undefined;
  }

  private async handleRagApi(
    method: string,
    segments: string[],
    body: string,
    socket: any,
    path: string
  ): Promise<boolean> {
    if (segments.length === 0) {
      if (method === 'GET') {
        try {
          const enabled = await RAGService.isEnabled();
          const storage = await RAGService.getStorageType();
          this.sendJSONResponse(socket, 200, {
            enabled,
            storage,
            ready: RAGService.isReady(),
          });
          logger.logWebRequest(method, path, 200);
        } catch (error) {
          this.sendJSONResponse(socket, 500, { error: 'rag_status_failed' });
          logger.logWebRequest(method, path, 500);
        }
        return true;
      }

      if (method === 'POST') {
        if (!body) {
          this.sendJSONResponse(socket, 400, { error: 'empty_body' });
          logger.logWebRequest(method, path, 400);
          return true;
        }

        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch (error) {
          this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
          logger.logWebRequest(method, path, 400);
          return true;
        }

        const enabled = payload?.enabled;
        const storage = payload?.storage;
        const provider = this.normalizeProvider(payload?.provider);

        try {
          if (typeof enabled === 'boolean') {
            await RAGService.setEnabled(enabled);
          }

          if (storage === 'memory' || storage === 'persistent') {
            await RAGService.setStorageType(storage);
          }

          if (payload?.initialize) {
            await RAGService.initialize(provider);
          }

          this.sendJSONResponse(socket, 200, {
            enabled: await RAGService.isEnabled(),
            storage: await RAGService.getStorageType(),
            ready: RAGService.isReady(),
          });
          logger.logWebRequest(method, path, 200);
        } catch (error) {
          this.sendJSONResponse(socket, 500, { error: 'rag_update_failed' });
          logger.logWebRequest(method, path, 500);
        }
        return true;
      }
    }

    if (segments[0] === 'reset' && method === 'POST') {
      try {
        await RAGService.clear();
        this.sendJSONResponse(socket, 200, { status: 'cleared' });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        this.sendJSONResponse(socket, 500, { error: 'rag_reset_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    return false;
  }

  private async handleServerStatusApi(method: string, socket: any, path: string): Promise<boolean> {
    if (method !== 'GET') {
      return false;
    }

    const status = this.getStatus();
    const modelLoaded = llamaManager.isInitialized();
    const modelPath = llamaManager.getModelPath();

    this.sendJSONResponse(socket, 200, {
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
  }

  private async handleModelApi(
    method: string,
    segments: string[],
    body: string,
    socket: any,
    path: string
  ): Promise<boolean> {
    if (segments.length > 0) {
      const target = segments[0];
      if (target === 'apple-foundation') {
        return await this.handleAppleFoundationModelApi(method, segments.slice(1), body, socket, path);
      }
      if (target === 'remote') {
        return await this.handleRemoteModelApi(method, segments.slice(1), body, socket, path);
      }
    }

    if (segments.length === 0 && method === 'POST') {
      if (!body) {
        this.sendJSONResponse(socket, 400, { error: 'empty_body' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      const action = typeof payload?.action === 'string' ? payload.action : '';
      const identifier = typeof payload?.model === 'string' ? payload.model : undefined;

      if (action === 'load') {
        try {
          const target = await this.ensureModelLoaded(identifier);
          this.sendJSONResponse(socket, 200, {
            status: 'loaded',
            model: {
              name: target.model.name,
              path: target.model.path,
              projector: target.projectorPath ?? null,
            },
          });
          logger.logWebRequest(method, path, 200);
        } catch (error) {
          const parsed = this.parseHttpError(error);
          this.sendJSONResponse(socket, parsed.status, { error: parsed.code });
          logger.logWebRequest(method, path, parsed.status);
        }
        return true;
      }

      if (action === 'unload') {
        try {
          if (llamaManager.isInitialized()) {
            await llamaManager.unloadModel();
          }
          this.sendJSONResponse(socket, 200, { status: 'unloaded' });
          logger.logWebRequest(method, path, 200);
        } catch (error) {
          this.sendJSONResponse(socket, 500, { error: 'model_unload_failed' });
          logger.logWebRequest(method, path, 500);
        }
        return true;
      }

      if (action === 'reload') {
        try {
          const current = llamaManager.getModelPath();
          if (!current) {
            this.sendJSONResponse(socket, 503, { error: 'model_not_loaded' });
            logger.logWebRequest(method, path, 503);
            return true;
          }

          await llamaManager.loadModel(current, llamaManager.getMultimodalProjectorPath() ?? undefined);
          this.sendJSONResponse(socket, 200, { status: 'reloaded', path: current });
          logger.logWebRequest(method, path, 200);
        } catch (error) {
          this.sendJSONResponse(socket, 500, { error: 'model_reload_failed' });
          logger.logWebRequest(method, path, 500);
        }
        return true;
      }

      this.sendJSONResponse(socket, 400, { error: 'invalid_action' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    return false;
  }

  private async handleSettingsApi(
    method: string,
    segments: string[],
    body: string,
    socket: any,
    path: string
  ): Promise<boolean> {
    if (method !== 'POST') {
      return false;
    }

    if (segments[0] === 'thinking') {
      if (!body) {
        this.sendJSONResponse(socket, 400, { error: 'empty_body' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      const enabled = payload?.enabled;
      if (typeof enabled !== 'boolean') {
        this.sendJSONResponse(socket, 400, { error: 'enabled_required' });
        logger.logWebRequest(method, path, 400);
        return true;
      }

      try {
        await llamaManager.setEnableThinking(enabled);
        this.sendJSONResponse(socket, 200, { status: 'updated', enabled });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        this.sendJSONResponse(socket, 500, { error: 'thinking_update_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    return false;
  }

  private async handleAppleFoundationModelApi(
    method: string,
    segments: string[],
    body: string,
    socket: any,
    path: string
  ): Promise<boolean> {
    if (segments.length > 0) {
      this.sendJSONResponse(socket, 404, { error: 'not_found' });
      logger.logWebRequest(method, path, 404);
      return true;
    }

    const available = appleFoundationService.isAvailable();
    const meetsRequirements = appleFoundationService.meetsMinimumRequirements();
    const enabled = available ? await appleFoundationService.isEnabled() : false;

    if (method === 'GET') {
      const message = this.buildAppleFoundationMessage(available, enabled, meetsRequirements);
      this.sendJSONResponse(socket, 200, {
        available,
        requirementsMet: meetsRequirements,
        enabled,
        status: available && enabled ? 'ready' : 'configure',
        message,
      });
      logger.logWebRequest(method, path, 200);
      return true;
    }

    if (method === 'POST') {
      if (body) {
        try {
          JSON.parse(body);
        } catch (error) {
          this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
          logger.logWebRequest(method, path, 400);
          return true;
        }
      }

      if (!available) {
        this.sendJSONResponse(socket, 501, {
          error: 'apple_foundation_unavailable',
          message: 'Apple Foundation is not available on this device.',
        });
        logger.logWebRequest(method, path, 501);
        return true;
      }

      if (!meetsRequirements) {
        this.sendJSONResponse(socket, 428, {
          error: 'requirements_not_met',
          message: 'Update the device to meet Apple Intelligence requirements.',
        });
        logger.logWebRequest(method, path, 428);
        return true;
      }

      if (!enabled) {
        this.sendJSONResponse(socket, 409, {
          error: 'apple_foundation_disabled',
          message: 'Enable Apple Foundation in settings on this device.',
        });
        logger.logWebRequest(method, path, 409);
        return true;
      }

      this.sendJSONResponse(socket, 200, { status: 'ready' });
      logger.logWebRequest(method, path, 200);
      return true;
    }

    this.sendJSONResponse(socket, 405, { error: 'method_not_allowed' });
    logger.logWebRequest(method, path, 405);
    return true;
  }

  private buildAppleFoundationMessage(available: boolean, enabled: boolean, meetsRequirements: boolean): string {
    if (!available) {
      if (Platform.OS === 'ios') {
        return 'Apple Foundation is not available on this device.';
      }
      return 'Apple Foundation is only available on supported Apple devices.';
    }

    if (!meetsRequirements) {
      return 'Update the device to meet Apple Intelligence requirements, then enable Apple Foundation in settings.';
    }

    if (!enabled) {
      return 'Enable Apple Foundation in settings on this device before using this endpoint.';
    }

    return 'Apple Foundation is ready to use.';
  }

  private async handleRemoteModelApi(
    method: string,
    segments: string[],
    body: string,
    socket: any,
    path: string
  ): Promise<boolean> {
    if (segments.length > 1) {
      this.sendJSONResponse(socket, 404, { error: 'not_found' });
      logger.logWebRequest(method, path, 404);
      return true;
    }

    const segment = segments[0];
    const providerFromPath = segment ? this.normalizeRemoteProvider(segment) : null;
    if (segment && !providerFromPath) {
      this.sendJSONResponse(socket, 404, { error: 'provider_not_found' });
      logger.logWebRequest(method, path, 404);
      return true;
    }

    if (method === 'GET') {
      const enabled = await this.getRemoteModelsEnabled();

      if (providerFromPath) {
        const summary = await this.getRemoteProviderState(providerFromPath);
        this.sendJSONResponse(socket, 200, {
          enabled,
          provider: summary,
          message: enabled
            ? 'Remote models are enabled.'
            : 'Enable remote models in settings to activate providers.',
        });
        logger.logWebRequest(method, path, 200);
        return true;
      }

      const summaries = await this.buildRemoteProviderSummaries();
      this.sendJSONResponse(socket, 200, {
        enabled,
        providers: summaries,
        message: enabled
          ? 'Remote models are enabled.'
          : 'Enable remote models in settings to activate providers.',
      });
      logger.logWebRequest(method, path, 200);
      return true;
    }

    if (method === 'POST') {
      const enabled = await this.getRemoteModelsEnabled();
      if (!enabled) {
        this.sendJSONResponse(socket, 409, {
          error: 'remote_models_disabled',
          message: 'Enable remote models in settings on the device.'
        });
        logger.logWebRequest(method, path, 409);
        return true;
      }

      let target = providerFromPath;

      if (!target) {
        if (!body) {
          this.sendJSONResponse(socket, 400, { error: 'provider_required' });
          logger.logWebRequest(method, path, 400);
          return true;
        }

        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch (error) {
          this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
          logger.logWebRequest(method, path, 400);
          return true;
        }

        target = this.normalizeRemoteProvider(payload?.provider);
        if (!target) {
          this.sendJSONResponse(socket, 400, { error: 'invalid_provider' });
          logger.logWebRequest(method, path, 400);
          return true;
        }
      } else if (body) {
        try {
          JSON.parse(body);
        } catch (error) {
          this.sendJSONResponse(socket, 400, { error: 'invalid_json' });
          logger.logWebRequest(method, path, 400);
          return true;
        }
      }

      try {
        const hasKey = await onlineModelService.hasApiKey(target);
        if (!hasKey) {
          const label = this.getRemoteProviderLabel(target);
          this.sendJSONResponse(socket, 422, {
            error: 'api_key_missing',
            message: `Add a ${label} API key in settings before using this provider.`,
          });
          logger.logWebRequest(method, path, 422);
          return true;
        }

        const summary = await this.getRemoteProviderState(target);
        this.sendJSONResponse(socket, 200, { status: 'ready', provider: summary });
        logger.logWebRequest(method, path, 200);
        return true;
      } catch (error) {
        this.sendJSONResponse(socket, 500, { error: 'remote_provider_check_failed' });
        logger.logWebRequest(method, path, 500);
        return true;
      }
    }

    this.sendJSONResponse(socket, 405, { error: 'method_not_allowed' });
    logger.logWebRequest(method, path, 405);
    return true;
  }

  private async getRemoteModelsEnabled(): Promise<boolean> {
    try {
      await apiKeyDatabase.initialize();
      const value = await apiKeyDatabase.getPreference(REMOTE_MODELS_PREF_KEY);
      return value === 'true';
    } catch (error) {
      return false;
    }
  }

  private normalizeRemoteProvider(value: any): RemoteProvider | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (REMOTE_PROVIDERS.includes(normalized as RemoteProvider)) {
      return normalized as RemoteProvider;
    }

    if (normalized === 'openai' || normalized.startsWith('gpt')) {
      return 'chatgpt';
    }

    if (normalized === 'anthropic' || normalized.startsWith('claude')) {
      return 'claude';
    }

    if (normalized.startsWith('gemini')) {
      return 'gemini';
    }

    if (normalized.startsWith('deepseek')) {
      return 'deepseek';
    }

    return null;
  }

  private async buildRemoteProviderSummaries(): Promise<RemoteProviderState[]> {
    const results: RemoteProviderState[] = [];
    for (const provider of REMOTE_PROVIDERS) {
      const state = await this.getRemoteProviderState(provider);
      results.push(state);
    }
    return results;
  }

  private async getRemoteProviderState(provider: RemoteProvider): Promise<RemoteProviderState> {
    try {
      const configured = await onlineModelService.hasApiKey(provider);
      const modelName = await onlineModelService.getModelName(provider);
      const usingDefault = await onlineModelService.isUsingDefaultKey(provider);
      const resolvedModel = modelName ?? onlineModelService.getDefaultModelName(provider);
      return {
        provider,
        configured,
        model: resolvedModel,
        usingDefault,
      };
    } catch (error) {
      return {
        provider,
        configured: false,
        model: null,
        usingDefault: false,
      };
    }
  }

  private getRemoteProviderLabel(provider: RemoteProvider): string {
    switch (provider) {
      case 'gemini':
        return 'Gemini';
      case 'chatgpt':
        return 'OpenAI';
      case 'deepseek':
        return 'DeepSeek';
      case 'claude':
        return 'Anthropic Claude';
      default:
        return provider;
    }
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
