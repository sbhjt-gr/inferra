import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

interface IosStartResult {
  success: boolean;
  url?: string;
  status?: string;
  error?: string;
}

interface IosStatusResult {
  isRunning: boolean;
  status?: string;
  url?: string;
}

interface IosModule {
  startVPNServer(options: { port?: number; url?: string }): Promise<IosStartResult>;
  stopVPNServer(): Promise<{ success: boolean }>;
  getStatus(): Promise<IosStatusResult>;
  updateVPNConfiguration(options: { port?: number; url?: string }): Promise<{ success: boolean }>;
}

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

const iosNativeModule = NativeModules.LocalServerVPNManager as IosModule | undefined;
const androidNativeModule = NativeModules.LocalServerBridge as AndroidModule | undefined;

class LocalServerPlatformBackground {
  private iosEmitter: NativeEventEmitter | null = null;
  private iosSubscription: { remove(): void } | null = null;
  private listeners = new Set<StatusListener>();
  private lastStatus: BackgroundStatus = { isRunning: false };

  constructor() {
    if (Platform.OS === 'ios' && iosNativeModule) {
      this.iosEmitter = new NativeEventEmitter(NativeModules.LocalServerVPNManager);
      this.iosSubscription = this.iosEmitter.addListener('LocalServerVPNStatusChanged', this.handleIosStatus);
      iosNativeModule.getStatus().then(result => {
        this.lastStatus = {
          isRunning: !!result?.isRunning,
          status: result?.status,
          url: result?.url,
        };
        this.emit();
      }).catch(() => {});
    }
  }

  private handleIosStatus = (payload: BackgroundStatus) => {
    this.lastStatus = {
      ...this.lastStatus,
      ...payload,
    };
    this.emit();
  };

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
      if (!iosNativeModule) {
        return { success: false, error: 'unsupported_platform' };
      }
      try {
        const result = await iosNativeModule.startVPNServer(options);
        if (result?.success) {
          this.lastStatus = {
            isRunning: true,
            status: result.status,
            url: result.url ?? options.url,
          };
          this.emit();
        }
        return result;
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'unknown_error' };
      }
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
      if (!iosNativeModule) {
        return { success: false };
      }
      try {
        const result = await iosNativeModule.stopVPNServer();
        this.lastStatus = {
          isRunning: false,
        };
        this.emit();
        return result;
      } catch (error) {
        return { success: false };
      }
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
      if (!iosNativeModule) {
        return;
      }
      try {
        await iosNativeModule.updateVPNConfiguration({ url: options.url, port: options.port });
      } catch (error) {
        return;
      }
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
}

export const localServerPlatformBackground = new LocalServerPlatformBackground();
