import { AppState, AppStateStatus, NativeModules, NativeEventEmitter } from 'react-native';
import { logger } from '../utils/logger';
import type { LocalServerService } from './LocalServerWebRTC';

const { LocalServerBackground } = NativeModules as { LocalServerBackground?: {
  start(options: { port?: number; identifier?: string }): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<{ running: boolean }>;
} };
const eventEmitter = LocalServerBackground
  ? new NativeEventEmitter(LocalServerBackground as any)
  : null;
let nativeEventSubscription: { remove(): void } | null = null;
const TASK_NAME = 'local-server-keepalive';
let provider: (() => LocalServerService | null) | null = null;
let appStateSubscription: { remove(): void } | null = null;
let currentState: AppStateStatus = AppState.currentState;

function getServer(): LocalServerService | null {
  if (!provider) {
    return null;
  }
  try {
    return provider() || null;
  } catch (error) {
    return null;
  }
}

function ensureNativeSubscription() {
  if (!eventEmitter || nativeEventSubscription) {
    return;
  }
  nativeEventSubscription = eventEmitter.addListener('local_server_maintenance', () => {
    const server = getServer();
    if (!server || !server.isServerRunning()) {
      return;
    }
    server.runBackgroundMaintenance().catch(() => {});
  });
}

async function registerTask() {
  if (LocalServerBackground) {
    try {
      const server = getServer();
      const status = server?.getStatus();
      let port: number | undefined;
      if (status?.signalingURL) {
        try {
          const parsed = new URL(status.signalingURL);
          const resolvedPort = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
          port = Number.isFinite(resolvedPort) ? resolvedPort : undefined;
        } catch (error) {
          logger.warn('local_server_background_port_parse_failed', 'webrtc');
        }
      }
      await LocalServerBackground.start({
        port,
        identifier: status?.offerSDP,
      });
    } catch (error) {
      logger.error('local_server_background_enable_failed', 'webrtc');
    }
    return;
  }
}

async function unregisterTask() {
  if (LocalServerBackground) {
    try {
      await LocalServerBackground.stop();
    } catch (error) {
      logger.error('local_server_background_disable_failed', 'webrtc');
    }
  }
}

async function syncRegistration() {
  const server = getServer();
  if (!server || !server.isServerRunning()) {
    await unregisterTask();
    return;
  }
  if (currentState === 'background' || currentState === 'inactive') {
    await registerTask();
  } else {
    await unregisterTask();
  }
}

function handleAppStateChange(nextState: AppStateStatus) {
  currentState = nextState;
  syncRegistration().catch(() => {});
}

export function setLocalServerProvider(fn: () => LocalServerService | null) {
  provider = fn;
  ensureNativeSubscription();
}

export async function enableLocalServerBackgroundSupport() {
  ensureNativeSubscription();
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
  }
  await syncRegistration();
}

export async function disableLocalServerBackgroundSupport() {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  await unregisterTask();
  if (nativeEventSubscription) {
    nativeEventSubscription.remove();
    nativeEventSubscription = null;
  }
}
