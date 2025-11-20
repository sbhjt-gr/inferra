import { tcpServer } from './TCPServer';
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
  signalingURL?: string;
  startTime?: Date;
}

export class LocalServerService extends SimpleEventEmitter {
  private isRunning: boolean = false;
  private signalingURL: string | null = null;
  private startTime: Date | null = null;
  private peerCount: number = 0;
  private peerWatcher: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
  }

  async start(): Promise<{ success: boolean; signalingURL?: string; error?: string }> {
    if (this.isRunning) {
      return { success: false, error: 'server_already_running' };
    }

    try {
      const serverResult = await tcpServer.start();

      this.signalingURL = serverResult.url;
      this.isRunning = true;
      this.startTime = new Date();
      this.peerCount = tcpServer.getClientCount();
      this.emit('peerCountChanged', { peerCount: this.peerCount });
      this.startPeerWatcher();

      this.emit('serverStarted', {
        signalingURL: this.signalingURL,
        isRunning: true,
        peerCount: this.peerCount
      });

      logger.info(`server_started url:${this.signalingURL}`, 'server');

      return {
        success: true,
        signalingURL: this.signalingURL || undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown_error';
      logger.error('server_start_failed', 'server');
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
      await tcpServer.stop();

      this.isRunning = false;
      this.startTime = null;
      this.signalingURL = null;
      this.stopPeerWatcher();
      this.peerCount = 0;
      this.emit('peerCountChanged', { peerCount: 0 });

      this.emit('serverStopped');

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown_error';
      logger.error('server_stop_failed', 'server');
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  getStatus(): ServerStatus {
    return {
      isRunning: this.isRunning,
      peerCount: this.peerCount,
      signalingURL: this.signalingURL || undefined,
      startTime: this.startTime || undefined
    };
  }

  isServerRunning(): boolean {
    return this.isRunning;
  }

  private startPeerWatcher() {
    if (this.peerWatcher) {
      return;
    }
    this.peerWatcher = setInterval(() => {
      const next = tcpServer.getClientCount();
      if (next !== this.peerCount) {
        this.peerCount = next;
        this.emit('peerCountChanged', { peerCount: this.peerCount });
      }
    }, 1000);
  }

  private stopPeerWatcher() {
    if (!this.peerWatcher) {
      return;
    }
    clearInterval(this.peerWatcher);
    this.peerWatcher = null;
  }
}

export const localServer = new LocalServerService();
