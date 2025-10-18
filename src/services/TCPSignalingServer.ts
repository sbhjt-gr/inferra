import TcpSocket from 'react-native-tcp-socket';
import * as Network from 'expo-network';
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
};

export class TCPSignalingServer {
  private server: any = null;
  private port: number = 8889;
  private clients: Map<string, any> = new Map();
  private offerSDP: string = '';
  private onAnswerReceived: ((answer: string, peerId: string) => void) | null = null;
  private isRunning: boolean = false;
  private localIP: string = '';
  private connectionStates: Map<string, ConnectionState> = new Map();

  async start(
    offerSDP: string,
    onAnswer: (answer: string, peerId: string) => void
  ): Promise<ServerStatus> {
    if (this.isRunning) {
      return {
        isRunning: true,
        url: `tcp://${this.localIP}:${this.port}`,
        port: this.port,
        clientCount: this.clients.size
      };
    }

    this.offerSDP = offerSDP;
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
        url: `tcp://${this.localIP}:${this.port}`,
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

    // Fallback: try to get from server address
    return this.getLocalIPAddress();
  }

  private handleConnection(socket: any): void {
    const peerId = this.generatePeerId();
    this.clients.set(peerId, socket);
    const state: ConnectionState = { isHTTP: false, hasSentOffer: false, offerTimer: null };
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
      this.handleMessage(peerId, socket, data.toString());
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

  private handleMessage(peerId: string, socket: any, rawData: string): void {
    try {
      // Check if this is an HTTP request
      if (rawData.startsWith('GET') || rawData.startsWith('POST') || rawData.startsWith('OPTIONS')) {
        this.handleHTTPRequest(peerId, socket, rawData);
        return;
      }

      // Handle JSON messages (line-delimited)
      const lines = rawData.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const message: SignalingMessage = JSON.parse(line);

          switch (message.type) {
            case 'answer':
              if (message.data && this.onAnswerReceived) {
                this.onAnswerReceived(message.data, peerId);
                this.sendMessage(socket, {
                  type: 'connected',
                  data: { success: true }
                });
                logger.info(`answer_received_from_peer peer:${peerId}`, 'webrtc');
              }
              break;

            case 'ice':
              logger.debug(`ice_candidate_received peer:${peerId}`, 'webrtc');
              break;

            case 'ping':
              this.sendMessage(socket, { type: 'ping', data: 'pong' });
              break;

            default:
              logger.warn(`unknown_message_type type:${message.type} peer:${peerId}`, 'webrtc');
          }
        } catch (parseError) {
          // Skip lines that aren't valid JSON
          continue;
        }
      }
    } catch (error) {
      logger.error(`message_parse_error peer:${peerId}`, 'webrtc');
    }
  }

  private handleHTTPRequest(peerId: string, socket: any, request: string): void {
    const state = this.connectionStates.get(peerId);
    if (state) {
      state.isHTTP = true;
      state.hasSentOffer = true;
      if (state.offerTimer) {
        clearTimeout(state.offerTimer);
        state.offerTimer = null;
      }
    }
    const lines = request.split('\r\n');
    const requestLine = lines[0];
    
    logger.info(`http_request_received: ${requestLine} peer:${peerId}`, 'webrtc');

    const [method, path] = requestLine.split(' ');

    if (method === 'GET' && path === '/') {
      const body = `<!DOCTYPE html>
<html>
<head><title>Inferra TCP Signaling</title></head>
<body>
  <h1>Inferra TCP Signaling Server</h1>
  <p>Status: Running</p>
  <p>Peer ID: ${peerId}</p>
  <p>This is a raw TCP socket server for WebRTC signaling.</p>
  <p>Browsers cannot connect directly to TCP. Please use the browser client HTML file.</p>
</body>
</html>`;
      const response = `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${body.length}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n${body}`;
      socket.write(response, () => {
        socket.end();
      });
    } else if (method === 'GET' && path === '/offer') {
      const body = JSON.stringify({
        type: 'offer',
        data: this.offerSDP,
        peerId: peerId
      });
      const response = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n${body}`;
      socket.write(response, () => {
        socket.end();
      });
    } else if (method === 'OPTIONS') {
      const response = `HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n`;
      socket.write(response, () => {
        socket.end();
      });
    } else {
      const body = 'Not Found';
      const response = `HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`;
      socket.write(response, () => {
        socket.end();
      });
    }
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
    this.sendMessage(socket, {
      type: 'offer',
      data: this.offerSDP,
      peerId
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
        // Ignore errors during cleanup
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
    this.onAnswerReceived = null;

    logger.info('tcp_signaling_server_stopped', 'webrtc');
  }

  getStatus(): ServerStatus {
    return {
      isRunning: this.isRunning,
      url: `tcp://${this.localIP}:${this.port}`,
      port: this.port,
      clientCount: this.clients.size
    };
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const tcpSignalingServer = new TCPSignalingServer();
