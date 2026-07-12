export type AppFunctionsStatus = 'supported' | 'permission_denied' | 'unavailable';

export type AppFunctionParam = {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
};

export type AppFunctionMeta = {
  handle: string;
  packageName: string;
  functionId: string;
  name: string;
  description: string;
  enabled: boolean;
  parameters: AppFunctionParam[];
};

export type AppFunctionsCapabilities = {
  sdk: number;
  appFunctions: AppFunctionsStatus;
};

export type ExecuteAppFunctionResult = {
  ok: boolean;
  valueJson?: string;
  error?: string;
};
