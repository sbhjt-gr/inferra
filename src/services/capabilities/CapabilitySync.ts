import { toolPolicyStore } from './ToolPolicyStore';
import { registerAppFunctionTools, unregisterAppFunctionTools } from '../tools/AppFunctionsTools';
import { registerRootTools, unregisterRootTools } from '../tools/RootTools';

export const syncCapabilityTools = async (): Promise<void> => {
  console.log('capability_sync');
  const policy = await toolPolicyStore.load();
  if (policy.emergencyDisabled || !policy.globalEnabled) {
    unregisterAppFunctionTools();
    unregisterRootTools();
    return;
  }
  if (policy.sources.app_functions) {
    await registerAppFunctionTools();
  } else {
    unregisterAppFunctionTools();
  }
  if (policy.sources.root) {
    await registerRootTools();
  } else {
    unregisterRootTools();
  }
};
