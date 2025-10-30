import { Platform, NativeModules } from 'react-native';

interface AndroidModule {
  startForegroundServer(port: number, url?: string): Promise<boolean>;
  stopForegroundServer(): Promise<boolean>;
  updateServerStatus(peerCount: number, url?: string): void;
}

type BackgroundStatus = {
  isRunning: boolean;
  status?: string;
  url?: string;
};

type StatusListener = (status: BackgroundStatus) => void;

const androidNativeModule = NativeModules.LocalServerBridge as AndroidModule | undefined;

class LocalServerBackground {
  private listeners = new Set<StatusListener>();
  private lastStatus: BackgroundStatus = { isRunning: false };

  constructor() {
  }

  private emit() {
    this.listeners.forEach(listener => listener(this.lastStatus));
  }

  onStatus(listener: StatusListener) {
    this.listeners.add(listener);
    listener(this.lastStatus);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(options: { port?: number; url?: string }) {
    if (Platform.OS === 'ios') {
      return { success: false, error: 'ios_background_not_supported' };
    }
    if (Platform.OS === 'android') {
      if (!androidNativeModule) {
        return { success: false, error: 'unsupported_platform' };
      }
      try {
        const port = typeof options.port === 'number' ? options.port : 0;
        await androidNativeModule.startForegroundServer(port, options.url ?? undefined);
        this.lastStatus = {
          isRunning: true,
          status: 'running',
          url: options.url,
        };
        this.emit();
        return { success: true, url: options.url, status: 'running' };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'unknown_error' };
      }
    }
    return { success: false, error: 'unsupported_platform' };
  }

  async stop() {
    if (Platform.OS === 'ios') {
      return { success: true };
    }
    if (Platform.OS === 'android') {
      if (!androidNativeModule) {
        return { success: false };
      }
      try {
        await androidNativeModule.stopForegroundServer();
        this.lastStatus = {
          isRunning: false,
        };
        this.emit();
        return { success: true };
      } catch (error) {
        return { success: false };
      }
    }
    return { success: false };
  }

  async update(options: { peerCount?: number; url?: string; port?: number }) {
    if (Platform.OS === 'ios') {
      return;
    }
    if (Platform.OS === 'android') {
      if (!androidNativeModule) {
        return;
      }
      try {
        const peers = typeof options.peerCount === 'number' ? options.peerCount : 0;
        androidNativeModule.updateServerStatus(peers, options.url ?? undefined);
      } catch (error) {
        return;
      }
    }
  }

  async requestPermission() {
    if (Platform.OS === 'ios') {
      return { success: false, error: 'ios_background_not_supported' };
    }
    return { success: true };
  }

  getSnapshot() {
    return this.lastStatus;
  }
}

export const localServerPlatformBackground = new LocalServerBackground();
