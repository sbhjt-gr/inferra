import * as RootNative from 'root-access';
import type {
  RootCapabilities,
  RootCommandMeta,
  RootExecuteResult,
  RootStatus,
} from 'root-access';

export type {
  RootCapabilities,
  RootCommandMeta,
  RootExecuteResult,
  RootStatus,
};

export const rootAccessAdapter = {
  getCapabilities(): Promise<RootCapabilities> {
    return RootNative.getCapabilities();
  },
  requestAccess(): Promise<RootStatus> {
    return RootNative.requestAccess();
  },
  listCommands(): Promise<RootCommandMeta[]> {
    return RootNative.listCommands();
  },
  executeCommand(
    commandId: string,
    args: Record<string, unknown>,
    requestId: string,
  ): Promise<RootExecuteResult> {
    return RootNative.executeCommand(commandId, args, requestId);
  },
  cancelCommand(requestId: string): Promise<boolean> {
    return RootNative.cancelCommand(requestId);
  },
};
