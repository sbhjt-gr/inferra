export type RootStatus = 'su_missing' | 'not_requested' | 'granted' | 'denied' | 'error' | 'unavailable';

export type RootCommandMeta = {
  id: string;
  family: 'diagnostics' | 'app_control' | 'settings' | 'files' | 'packages';
  risk: 'read' | 'write' | 'destructive';
  description: string;
};

export type RootCapabilities = {
  sdk: number;
  root: RootStatus;
};

export type RootExecuteResult = {
  ok: boolean;
  valueJson?: string;
  error?: string;
};
