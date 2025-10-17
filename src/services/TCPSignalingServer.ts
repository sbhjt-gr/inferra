import TcpSocket from 'react-native-tcp-socket';
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

export class TCPSignalingServer {
  private server: any = null;
  private port: number = 8889;
  private clients: Map<string, any> = new Map();
  private offerSDP: string = '';
  private onAnswerReceived: ((answer: string, peerId: string) => void) | null = null;
  private isRunning: boolean = false;
  private localIP: string = '';

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

      this.server.listen({ port: this.port, host: '0.0.0.0' }, () => {
        const address = this.server.address();
        this.localIP = this.getLocalIPAddress();
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

  private handleConnection(socket: any): void {
    const peerId = this.generatePeerId();
    this.clients.set(peerId, socket);

    logger.info(`tcp_client_connected peer:${peerId} total:${this.clients.size}`, 'webrtc');

    this.sendMessage(socket, {
      type: 'offer',
      data: this.offerSDP,
      peerId
    });

    socket.on('data', (data: Buffer) => {
      this.handleMessage(peerId, socket, data.toString());
    });

    socket.on('close', () => {
      this.clients.delete(peerId);
      logger.info(`tcp_client_disconnected peer:${peerId} total:${this.clients.size}`, 'webrtc');
    });

    socket.on('error', (error: Error) => {
      logger.error(`tcp_socket_error peer:${peerId} error:${error.message}`, 'webrtc');
      this.clients.delete(peerId);
    });
  }

  private handleMessage(peerId: string, socket: any, rawData: string): void {
    try {
      const lines = rawData.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
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
      }
    } catch (error) {
      logger.error(`message_parse_error peer:${peerId}`, 'webrtc');
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
