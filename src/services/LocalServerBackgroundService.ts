import { AppState, AppStateStatus, NativeModules, NativeEventEmitter } from 'react-native';
import { logger } from '../utils/logger';
import type { LocalServerService } from './LocalServerWebRTC';

const { LocalServerBackground } = NativeModules as { LocalServerBackground?: {
  start(options: { port?: number; identifier?: string; metadata?: Record<string, unknown> }): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<{ running: boolean }>;
  fetchPendingAnswer(): Promise<{ sdp: string; peerId?: string } | null>;
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
    if (LocalServerBackground?.fetchPendingAnswer) {
      LocalServerBackground.fetchPendingAnswer()
        .then((answer) => {
          if (!answer || typeof answer.sdp !== 'string') {
            return;
          }
          const peerId = typeof answer.peerId === 'string' ? answer.peerId : undefined;
          server.handleAnswer(answer.sdp, peerId).catch(() => {});
        })
        .catch(() => {});
    }
  });
}

async function registerTask() {
  if (LocalServerBackground) {
    try {
      const server = getServer();
      const status = server?.getStatus();
      let port: number | undefined;
      const metadata: Record<string, unknown> = {};
      if (status?.signalingURL) {
        try {
          const parsed = new URL(status.signalingURL);
          const resolvedPort = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
          port = Number.isFinite(resolvedPort) ? resolvedPort : undefined;
        } catch (error) {
          logger.warn('local_server_background_port_parse_failed', 'webrtc');
        }
      }
      if (status) {
        metadata.running = status.isRunning;
        metadata.peerCount = status.peerCount;
        if (typeof status.offerSDP === 'string') {
          metadata.offerSDP = status.offerSDP;
        }
        if (typeof status.offerPeerId === 'string') {
          metadata.offerPeerId = status.offerPeerId;
        }
        if (typeof status.signalingURL === 'string') {
          metadata.signalingURL = status.signalingURL;
        }
        if (status.startTime instanceof Date) {
          metadata.startTime = status.startTime.toISOString();
        }
        metadata.updatedAt = new Date().toISOString();
      }
      await LocalServerBackground.start({
        port,
        identifier: status?.offerSDP,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
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
