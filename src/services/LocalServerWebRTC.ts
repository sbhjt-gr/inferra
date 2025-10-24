import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebRTCPeerManager } from './webrtc/WebRTCPeerManager';
import { tcpSignalingServer } from './TCPSignalingServer';
import { logger } from '../utils/logger';
import {
  enableLocalServerBackgroundSupport,
  disableLocalServerBackgroundSupport,
  setLocalServerProvider
} from './LocalServerBackgroundService';

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
  backgroundKeepAlive?: boolean;
}

export class LocalServerService extends SimpleEventEmitter {
  private isRunning: boolean = false;
  private peerManager: WebRTCPeerManager | null = null;
  private offerSDP: string | null = null;
  private offerPeerId: string | null = null;
  private signalingURL: string | null = null;
  private startTime: Date | null = null;
  private peerCount: number = 0;
  private settingsLoaded: boolean = false;
  private settingsPromise: Promise<void> | null = null;
  private autoStart: boolean = false;
  private allowExternalAccess: boolean = true;
  private backgroundKeepAlive: boolean = false;
  private readonly SETTINGS_KEY = 'local_server_preferences';

  private handlePeerConnected = () => {
    this.peerCount = this.peerManager ? this.peerManager.getConnectionCount() : 0;
    this.emit('peerCountChanged', this.peerCount);
    this.emit('statusChanged', this.getStatus());
  };

  private handlePeerDisconnected = () => {
    this.peerCount = this.peerManager ? this.peerManager.getConnectionCount() : 0;
    this.emit('peerCountChanged', this.peerCount);
    this.emit('statusChanged', this.getStatus());
  };

  constructor() {
    super();
  }

  private async ensureSettingsLoaded(): Promise<void> {
    if (this.settingsLoaded) {
      return;
    }
    if (!this.settingsPromise) {
      this.settingsPromise = (async () => {
        try {
          const stored = await AsyncStorage.getItem(this.SETTINGS_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (typeof parsed.autoStart === 'boolean') {
              this.autoStart = parsed.autoStart;
            }
            if (typeof parsed.allowExternalAccess === 'boolean') {
              this.allowExternalAccess = parsed.allowExternalAccess;
            }
            if (typeof parsed.backgroundKeepAlive === 'boolean') {
              this.backgroundKeepAlive = parsed.backgroundKeepAlive;
            }
          }
        } catch (error) {
        } finally {
          this.settingsLoaded = true;
        }
      })();
    }
    try {
      await this.settingsPromise;
    } finally {
      this.settingsPromise = null;
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      const payload = JSON.stringify({
        autoStart: this.autoStart,
        allowExternalAccess: this.allowExternalAccess,
        backgroundKeepAlive: this.backgroundKeepAlive
      });
      await AsyncStorage.setItem(this.SETTINGS_KEY, payload);
    } catch (error) {
      logger.warn('local_server_settings_save_failed', 'webrtc');
    }
  }

  async initialize(): Promise<void> {
    await this.ensureSettingsLoaded();
    this.emit('statusChanged', this.getStatus());
    if (this.autoStart && !this.isRunning) {
      const result = await this.start();
      if (!result.success) {
        logger.error('local_server_autostart_failed', 'webrtc');
      }
    }
  }

  async start(): Promise<{ success: boolean; offerSDP?: string; signalingURL?: string; error?: string }> {
    if (this.isRunning) {
      return { success: false, error: 'server_already_running' };
    }

    try {
      await this.ensureSettingsLoaded();
      this.peerManager = new WebRTCPeerManager();
      this.peerManager.setCallbacks({
        onPeerConnected: this.handlePeerConnected,
        onPeerDisconnected: this.handlePeerDisconnected
      });

      const offer = await this.peerManager.createOffer();
      this.offerSDP = offer.sdp;
      this.offerPeerId = offer.peerId;

      const signalingResult = await tcpSignalingServer.start(
        offer.sdp,
        offer.peerId,
        async (answerSDP: string, peerId: string) => {
          await this.handleAnswer(answerSDP, peerId);
        },
        { allowExternalAccess: this.allowExternalAccess }
      );

      this.signalingURL = signalingResult.url;
      this.isRunning = true;
      this.startTime = new Date();
      this.peerCount = this.peerManager.getConnectionCount();

      this.emit('serverStarted', {
        offerSDP: this.offerSDP,
        signalingURL: this.signalingURL,
        isRunning: true
      });
      this.emit('peerCountChanged', this.peerCount);

      if (this.backgroundKeepAlive) {
        await enableLocalServerBackgroundSupport().catch(() => {});
      } else {
        await disableLocalServerBackgroundSupport().catch(() => {});
      }
      this.emit('statusChanged', this.getStatus());

      logger.info(`webrtc_server_started signaling:${this.signalingURL}`, 'webrtc');

      return {
        success: true,
        offerSDP: this.offerSDP || undefined,
        signalingURL: this.signalingURL || undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown_error';
      logger.error('webrtc_start_failed', 'webrtc');
      if (this.peerManager) {
        this.peerManager.closeAllConnections();
        this.peerManager = null;
      }
      this.isRunning = false;
      this.startTime = null;
      this.peerCount = 0;
      await disableLocalServerBackgroundSupport().catch(() => {});
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
      const actualPeerId = peerId || this.offerPeerId || `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await this.peerManager.handleAnswer(answerSDP, actualPeerId);

      this.emit('answerReceived', actualPeerId);
      this.peerCount = this.peerManager.getConnectionCount();
      this.emit('peerCountChanged', this.peerCount);
      this.emit('statusChanged', this.getStatus());

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
        this.peerManager.closeAllConnections();
        this.peerManager = null;
      }

      await tcpSignalingServer.stop();

      this.isRunning = false;
      this.startTime = null;
      this.offerSDP = null;
      this.offerPeerId = null;
      this.signalingURL = null;
      this.peerCount = 0;

      this.emit('serverStopped');
      await disableLocalServerBackgroundSupport().catch(() => {});
      this.emit('peerCountChanged', this.peerCount);
      this.emit('statusChanged', this.getStatus());

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
      peerCount: this.peerCount,
      offerSDP: this.offerSDP || undefined,
      signalingURL: this.signalingURL || undefined,
      startTime: this.startTime || undefined,
      backgroundKeepAlive: this.backgroundKeepAlive
    };
  }

  isServerRunning(): boolean {
    return this.isRunning;
  }

  getOfferSDP(): string | null {
    return this.offerSDP;
  }

  async getSettings(): Promise<{ autoStart: boolean; allowExternalAccess: boolean; backgroundKeepAlive: boolean }> {
    await this.ensureSettingsLoaded();
    return {
      autoStart: this.autoStart,
      allowExternalAccess: this.allowExternalAccess,
      backgroundKeepAlive: this.backgroundKeepAlive
    };
  }

  async setAutoStartEnabled(enabled: boolean): Promise<void> {
    await this.ensureSettingsLoaded();
    if (this.autoStart === enabled) {
      return;
    }
    this.autoStart = enabled;
    await this.saveSettings();
  }

  async setExternalAccessEnabled(enabled: boolean): Promise<{ success: boolean; error?: string }> {
    await this.ensureSettingsLoaded();
    if (this.allowExternalAccess === enabled) {
      return { success: true };
    }
    const previous = this.allowExternalAccess;
    this.allowExternalAccess = enabled;
    await this.saveSettings();

    if (!this.isRunning) {
      return { success: true };
    }

    const stopResult = await this.stop();
    if (!stopResult.success) {
      this.allowExternalAccess = previous;
      await this.saveSettings();
      return stopResult;
    }

    const startResult = await this.start();
    if (!startResult.success) {
      this.allowExternalAccess = previous;
      await this.saveSettings();
      const fallback = await this.start();
      if (!fallback.success) {
        logger.error('local_server_restart_recovery_failed', 'webrtc');
      }
      return { success: false, error: startResult.error || 'restart_failed' };
    }

    return { success: true };
  }

  async setBackgroundKeepAliveEnabled(enabled: boolean): Promise<void> {
    await this.ensureSettingsLoaded();
    if (this.backgroundKeepAlive === enabled) {
      return;
    }

    const previous = this.backgroundKeepAlive;
    this.backgroundKeepAlive = enabled;

    try {
      if (this.isRunning) {
        if (enabled) {
          await enableLocalServerBackgroundSupport();
        } else {
          await disableLocalServerBackgroundSupport();
        }
      }
      await this.saveSettings();
      this.emit('statusChanged', this.getStatus());
    } catch (error) {
      this.backgroundKeepAlive = previous;
      if (this.isRunning) {
        if (previous) {
          await enableLocalServerBackgroundSupport().catch(() => {});
        } else {
          await disableLocalServerBackgroundSupport().catch(() => {});
        }
      }
      await this.saveSettings().catch(() => {});
      this.emit('statusChanged', this.getStatus());
      throw error instanceof Error ? error : new Error('background_toggle_failed');
    }
  }

  async runBackgroundMaintenance(): Promise<void> {
    if (!this.backgroundKeepAlive) {
      return;
    }
    if (!this.isRunning) {
      return;
    }
    await tcpSignalingServer.maintainBackgroundConnections();
    const count = this.peerManager ? this.peerManager.sendKeepAlive() : 0;
    this.peerCount = count;
    this.emit('peerCountChanged', this.peerCount);
    this.emit('statusChanged', this.getStatus());
  }
}

export const localServerWebRTC = new LocalServerService();

setLocalServerProvider(() => localServerWebRTC);
void localServerWebRTC.initialize();
