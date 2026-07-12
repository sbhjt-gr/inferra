import * as AppFunctionsNative from 'app-functions';
import type {
  AppFunctionMeta,
  AppFunctionsCapabilities,
  ExecuteAppFunctionResult,
} from 'app-functions';

export type {
  AppFunctionMeta,
  AppFunctionsCapabilities,
  ExecuteAppFunctionResult,
};

export const appFunctionsAdapter = {
  getCapabilities(): Promise<AppFunctionsCapabilities> {
    return AppFunctionsNative.getCapabilities();
  },
  searchFunctions(query?: string): Promise<AppFunctionMeta[]> {
    return AppFunctionsNative.searchFunctions(query);
  },
  executeFunction(
    handle: string,
    args: Record<string, unknown>,
    requestId: string,
  ): Promise<ExecuteAppFunctionResult> {
    return AppFunctionsNative.executeFunction(handle, args, requestId);
  },
  cancelExecution(requestId: string): Promise<boolean> {
    return AppFunctionsNative.cancelExecution(requestId);
  },
  setProviderEnabled(enabled: boolean): Promise<boolean> {
    return AppFunctionsNative.setProviderEnabled(enabled);
  },
  isProviderEnabled(): Promise<boolean> {
    return AppFunctionsNative.isProviderEnabled();
  },
};
