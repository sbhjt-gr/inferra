import { WebRTCPeerManager } from './webrtc/WebRTCPeerManager';
import { tcpSignalingServer } from './TCPSignalingServer';
import { logger } from '../utils/logger';

class SimpleEventEmitter {
  private listeners: { [event: string]: Function[] } = {};

  on(event: string, listener: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  off(event: string, listener: Function) {
    if (this.listeners[event]) {
      const index = this.listeners[event].indexOf(listener);
      if (index > -1) {
        this.listeners[event].splice(index, 1);
      }
    }
  }

  emit(event: string, ...args: any[]) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(listener => listener(...args));
    }
  }

  removeAllListeners(event?: string) {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
  }
}

interface ServerStatus {
  isRunning: boolean;
  peerCount: number;
  offerSDP?: string;
  signalingURL?: string;
  startTime?: Date;
}

export class LocalServerService extends SimpleEventEmitter {
  private isRunning: boolean = false;
  private peerManager: WebRTCPeerManager | null = null;
  private offerSDP: string | null = null;
  private signalingURL: string | null = null;
  private startTime: Date | null = null;

  constructor() {
    super();
  }

  async start(): Promise<{ success: boolean; offerSDP?: string; signalingURL?: string; error?: string }> {
    if (this.isRunning) {
      return { success: false, error: 'server_already_running' };
    }

    try {
      this.peerManager = new WebRTCPeerManager();

      const offerSDP = await this.peerManager.createOffer();
      this.offerSDP = offerSDP;

      const signalingResult = await tcpSignalingServer.start(
        offerSDP,
        async (answerSDP: string, peerId: string) => {
          await this.handleAnswer(answerSDP, peerId);
        }
      );

      this.signalingURL = signalingResult.url;
      this.isRunning = true;
      this.startTime = new Date();

      this.emit('serverStarted', {
        offerSDP: this.offerSDP,
        signalingURL: this.signalingURL,
        isRunning: true
      });

      logger.info(`webrtc_server_started signaling:${this.signalingURL}`, 'webrtc');

      return {
        success: true,
        offerSDP: this.offerSDP || undefined,
        signalingURL: this.signalingURL || undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown_error';
      logger.error('webrtc_start_failed', 'webrtc');
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async handleAnswer(answerSDP: string, peerId?: string): Promise<{ success: boolean; error?: string }> {
    if (!this.peerManager) {
      return { success: false, error: 'server_not_started' };
    }

    try {
      const actualPeerId = peerId || `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await this.peerManager.handleAnswer(answerSDP, actualPeerId);

      this.emit('answerReceived', actualPeerId);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown_error';
      logger.error('webrtc_answer_failed');
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async stop(): Promise<{ success: boolean; error?: string }> {
    if (!this.isRunning) {
      return { success: false, error: 'server_not_running' };
    }

    try {
      if (this.peerManager) {
        this.peerManager = null;
      }

      this.isRunning = false;
      this.startTime = null;
      this.offerSDP = null;

      this.emit('serverStopped');

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown_error';
      logger.error('webrtc_stop_failed');
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  getStatus(): ServerStatus {
    return {
      isRunning: this.isRunning,
      peerCount: 0,
      offerSDP: this.offerSDP || undefined,
      startTime: this.startTime || undefined
    };
  }

  isServerRunning(): boolean {
    return this.isRunning;
  }

  getOfferSDP(): string | null {
    return this.offerSDP;
  }
}

export const localServerWebRTC = new LocalServerService();
