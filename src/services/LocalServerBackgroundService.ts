import { AppState, AppStateStatus } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { logger } from '../utils/logger';
import type { LocalServerService } from './LocalServerWebRTC';

const TASK_NAME = 'local-server-keepalive';
let provider: (() => LocalServerService | null) | null = null;
let appStateSubscription: { remove(): void } | null = null;
let currentState: AppStateStatus = AppState.currentState;
const backgroundTaskModule: any = BackgroundTask as any;

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

function ensureTaskDefinition() {
  const manager: any = TaskManager;
  if (manager.isTaskDefined && manager.isTaskDefined(TASK_NAME)) {
    return;
  }
  TaskManager.defineTask(TASK_NAME, async () => {
    const server = getServer();
    if (!server || !server.isServerRunning()) {
      return backgroundTaskModule.BackgroundTaskResult.NoData;
    }
    try {
      await server.runBackgroundMaintenance();
      return backgroundTaskModule.BackgroundTaskResult.NewData;
    } catch (error) {
      logger.error('local_server_background_task_failed', 'webrtc');
      return backgroundTaskModule.BackgroundTaskResult.Failed;
    }
  });
}

async function registerTask() {
  const registered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (registered) {
    return;
  }
  await backgroundTaskModule.registerTaskAsync(TASK_NAME, {
    minimumInterval: 120,
    stopOnTerminate: false,
    startOnBoot: true
  });
}

async function unregisterTask() {
  const registered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (!registered) {
    return;
  }
  await backgroundTaskModule.unregisterTaskAsync(TASK_NAME);
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
  ensureTaskDefinition();
}

export async function enableLocalServerBackgroundSupport() {
  ensureTaskDefinition();
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
}
