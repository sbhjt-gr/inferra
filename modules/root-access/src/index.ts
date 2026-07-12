import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

import type {
  RootCapabilities,
  RootCommandMeta,
  RootExecuteResult,
  RootStatus,
} from './types';

type NativeModule = {
  getCapabilities(): Promise<RootCapabilities>;
  requestAccess(): Promise<RootStatus>;
  listCommands(): Promise<RootCommandMeta[]>;
  executeCommand(commandId: string, argsJson: string, requestId: string): Promise<RootExecuteResult>;
  cancelCommand(requestId: string): Promise<boolean>;
};

let native: NativeModule | null = null;

try {
  if (Platform.OS === 'android') {
    native = requireNativeModule<NativeModule>('RootAccess');
  }
} catch {
  native = null;
}

export async function getCapabilities(): Promise<RootCapabilities> {
  console.log('root_caps');
  if (!native) {
    return { sdk: 0, root: 'unavailable' };
  }
  return native.getCapabilities();
}

export async function requestAccess(): Promise<RootStatus> {
  console.log('root_request');
  if (!native) {
    return 'unavailable';
  }
  return native.requestAccess();
}

export async function listCommands(): Promise<RootCommandMeta[]> {
  if (!native) {
    return [];
  }
  return native.listCommands();
}

export async function executeCommand(
  commandId: string,
  args: Record<string, unknown>,
  requestId: string,
): Promise<RootExecuteResult> {
  console.log('root_exec', commandId);
  if (!native) {
    return { ok: false, error: 'unsupported_platform' };
  }
  return native.executeCommand(commandId, JSON.stringify(args || {}), requestId);
}

export async function cancelCommand(requestId: string): Promise<boolean> {
  if (!native) {
    return false;
  }
  return native.cancelCommand(requestId);
}

export default {
  getCapabilities,
  requestAccess,
  listCommands,
  executeCommand,
  cancelCommand,
};
