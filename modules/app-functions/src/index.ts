import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

import type {
  AppFunctionMeta,
  AppFunctionsCapabilities,
  ExecuteAppFunctionResult,
} from './types';

type NativeModule = {
  getCapabilities(): Promise<AppFunctionsCapabilities>;
  searchFunctions(query?: string): Promise<AppFunctionMeta[]>;
  executeFunction(handle: string, argsJson: string, requestId: string): Promise<ExecuteAppFunctionResult>;
  cancelExecution(requestId: string): Promise<boolean>;
  setProviderEnabled(enabled: boolean): Promise<boolean>;
  isProviderEnabled(): Promise<boolean>;
};

let native: NativeModule | null = null;

try {
  if (Platform.OS === 'android') {
    native = requireNativeModule<NativeModule>('AppFunctions');
  }
} catch {
  native = null;
}

const unsupportedCaps = (): AppFunctionsCapabilities => ({
  sdk: Platform.OS === 'android' ? Number(Platform.Version) || 0 : 0,
  appFunctions: 'unavailable',
});

export async function getCapabilities(): Promise<AppFunctionsCapabilities> {
  console.log('appfn_caps');
  if (!native) {
    return unsupportedCaps();
  }
  return native.getCapabilities();
}

export async function searchFunctions(query?: string): Promise<AppFunctionMeta[]> {
  console.log('appfn_search');
  if (!native) {
    return [];
  }
  return native.searchFunctions(query);
}

export async function executeFunction(
  handle: string,
  args: Record<string, unknown>,
  requestId: string,
): Promise<ExecuteAppFunctionResult> {
  console.log('appfn_exec');
  if (!native) {
    return { ok: false, error: 'unsupported_platform' };
  }
  return native.executeFunction(handle, JSON.stringify(args || {}), requestId);
}

export async function cancelExecution(requestId: string): Promise<boolean> {
  if (!native) {
    return false;
  }
  return native.cancelExecution(requestId);
}

export async function setProviderEnabled(enabled: boolean): Promise<boolean> {
  console.log('appfn_provider', enabled);
  if (!native) {
    return false;
  }
  return native.setProviderEnabled(enabled);
}

export async function isProviderEnabled(): Promise<boolean> {
  if (!native) {
    return false;
  }
  return native.isProviderEnabled();
}

export default {
  getCapabilities,
  searchFunctions,
  executeFunction,
  cancelExecution,
  setProviderEnabled,
  isProviderEnabled,
};
