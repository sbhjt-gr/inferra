import { appFunctionsAdapter, type AppFunctionMeta } from '../adapters/AppFunctionsAdapter';
import { toolPolicyStore } from '../capabilities/ToolPolicyStore';
import { toolRegistry, type ToolParam, type ToolSchema } from './ToolRegistry';

const OWNER = 'app_functions';
const handleMap = new Map<string, string>();

const toToolName = (meta: AppFunctionMeta): string => {
  const raw = `${meta.packageName}__${meta.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
  return `af_${raw}`.slice(0, 64);
};

const mapParamType = (type: string): string => {
  const lower = type.toLowerCase();
  if (lower.includes('int')) return 'integer';
  if (lower.includes('bool')) return 'boolean';
  if (lower.includes('number') || lower.includes('double') || lower.includes('float')) return 'number';
  if (lower.includes('list') || lower.includes('array')) return 'array';
  return 'string';
};

const toSchema = (meta: AppFunctionMeta, toolName: string): ToolSchema => {
  const properties: Record<string, ToolParam> = {};
  const required: string[] = [];
  for (const param of meta.parameters || []) {
    properties[param.name] = {
      type: mapParamType(param.type),
      description: param.description || param.name,
    };
    if (param.required) {
      required.push(param.name);
    }
  }
  return {
    type: 'function',
    function: {
      name: toolName,
      description: `${meta.description} [${meta.packageName}]`,
      parameters: {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
};

export const unregisterAppFunctionTools = (): void => {
  toolRegistry.unregisterByOwner(OWNER);
  handleMap.clear();
  console.log('appfn_tools_clear');
};

export const registerAppFunctionTools = async (): Promise<void> => {
  unregisterAppFunctionTools();
  const caps = await appFunctionsAdapter.getCapabilities();
  if (caps.appFunctions !== 'supported') {
    console.log('appfn_tools_skip', caps.appFunctions);
    return;
  }
  const policy = toolPolicyStore.snapshot();
  const found = await appFunctionsAdapter.searchFunctions();
  let registered = 0;
  for (const meta of found) {
    if (!meta.enabled) {
      continue;
    }
    const toolName = toToolName(meta);
    if (policy.tools[toolName] === false) {
      continue;
    }
    handleMap.set(toolName, meta.handle);
    const schema = toSchema(meta, toolName);
    toolRegistry.register(
      toolName,
      schema,
      async (args, ctx) => {
        const handle = handleMap.get(toolName);
        if (!handle) {
          throw new Error('stale_handle');
        }
        if (ctx.signal?.aborted) {
          throw new Error('tool_cancelled');
        }
        const onAbort = () => {
          appFunctionsAdapter.cancelExecution(ctx.requestId).catch(() => {});
        };
        ctx.signal?.addEventListener('abort', onAbort);
        try {
          const result = await appFunctionsAdapter.executeFunction(handle, args, ctx.requestId);
          if (!result.ok) {
            throw new Error(result.error || 'execution_failed');
          }
          return result.valueJson || '{}';
        } finally {
          ctx.signal?.removeEventListener('abort', onAbort);
        }
      },
      { ownerId: OWNER, source: 'app_functions', risk: 'write' },
    );
    registered += 1;
  }
  console.log('appfn_tools_ready', registered);
};
