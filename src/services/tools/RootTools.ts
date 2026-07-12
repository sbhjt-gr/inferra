import { rootAccessAdapter } from '../adapters/RootAccessAdapter';
import { toolPolicyStore } from '../capabilities/ToolPolicyStore';
import { toolRegistry, type ToolRisk, type ToolSchema } from './ToolRegistry';

const OWNER = 'root_tools';

const ROOT_TOOL_SCHEMAS: Array<{
  schema: ToolSchema;
  risk: ToolRisk;
  commandId: string;
}> = [
  {
    commandId: 'device_health',
    risk: 'read',
    schema: {
      type: 'function',
      function: {
        name: 'device_health',
        description: 'Read thermal, memory, and battery health summary using elevated access.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
  },
  {
    commandId: 'log_slice',
    risk: 'read',
    schema: {
      type: 'function',
      function: {
        name: 'log_slice',
        description: 'Read a short filtered device log slice.',
        parameters: {
          type: 'object',
          properties: {
            filter: { type: 'string', description: 'Log tag filter.' },
          },
          additionalProperties: false,
        },
      },
    },
  },
  {
    commandId: 'app_force_stop',
    risk: 'write',
    schema: {
      type: 'function',
      function: {
        name: 'app_force_stop',
        description: 'Force-stop a non-protected app package.',
        parameters: {
          type: 'object',
          properties: {
            packageName: { type: 'string', description: 'Target package name.' },
          },
          required: ['packageName'],
          additionalProperties: false,
        },
      },
    },
  },
  {
    commandId: 'app_trim_cache',
    risk: 'write',
    schema: {
      type: 'function',
      function: {
        name: 'app_trim_cache',
        description: 'Request cache trim for storage pressure relief.',
        parameters: {
          type: 'object',
          properties: {
            packageName: { type: 'string', description: 'Package hint for the trim request.' },
          },
          required: ['packageName'],
          additionalProperties: false,
        },
      },
    },
  },
  {
    commandId: 'setting_apply',
    risk: 'write',
    schema: {
      type: 'function',
      function: {
        name: 'setting_apply',
        description: 'Apply an allowlisted system animation or stay-awake setting.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              enum: [
                'animator_duration_scale',
                'transition_animation_scale',
                'window_animation_scale',
                'stay_on_while_plugged_in',
              ],
            },
            value: { type: 'string', description: 'Numeric setting value.' },
          },
          required: ['key', 'value'],
          additionalProperties: false,
        },
      },
    },
  },
  {
    commandId: 'setting_restore',
    risk: 'write',
    schema: {
      type: 'function',
      function: {
        name: 'setting_restore',
        description: 'Restore a previously changed allowlisted setting.',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Setting key to restore.' },
          },
          required: ['key'],
          additionalProperties: false,
        },
      },
    },
  },
  {
    commandId: 'file_copy',
    risk: 'write',
    schema: {
      type: 'function',
      function: {
        name: 'file_copy',
        description: 'Copy a file within approved shared storage paths.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Source absolute path.' },
            to: { type: 'string', description: 'Destination absolute path.' },
          },
          required: ['from', 'to'],
          additionalProperties: false,
        },
      },
    },
  },
  {
    commandId: 'package_set_enabled',
    risk: 'write',
    schema: {
      type: 'function',
      function: {
        name: 'package_set_enabled',
        description: 'Enable or disable an eligible non-system package.',
        parameters: {
          type: 'object',
          properties: {
            packageName: { type: 'string' },
            enabled: { type: 'boolean' },
          },
          required: ['packageName', 'enabled'],
          additionalProperties: false,
        },
      },
    },
  },
  {
    commandId: 'package_install_review',
    risk: 'write',
    schema: {
      type: 'function',
      function: {
        name: 'package_install_review',
        description: 'Open the system installer UI for an APK path. Never silent-installs.',
        parameters: {
          type: 'object',
          properties: {
            apkPath: { type: 'string' },
          },
          required: ['apkPath'],
          additionalProperties: false,
        },
      },
    },
  },
  {
    commandId: 'package_uninstall_review',
    risk: 'destructive',
    schema: {
      type: 'function',
      function: {
        name: 'package_uninstall_review',
        description: 'Open the system uninstall confirmation UI for a package.',
        parameters: {
          type: 'object',
          properties: {
            packageName: { type: 'string' },
          },
          required: ['packageName'],
          additionalProperties: false,
        },
      },
    },
  },
];

export const unregisterRootTools = (): void => {
  toolRegistry.unregisterByOwner(OWNER);
  console.log('root_tools_clear');
};

export const registerRootTools = async (): Promise<void> => {
  unregisterRootTools();
  const caps = await rootAccessAdapter.getCapabilities();
  if (caps.root === 'unavailable' || caps.root === 'su_missing') {
    console.log('root_tools_skip', caps.root);
    return;
  }
  const policy = toolPolicyStore.snapshot();
  for (const item of ROOT_TOOL_SCHEMAS) {
    const name = item.schema.function.name;
    if (policy.tools[name] === false) {
      continue;
    }
    toolRegistry.register(
      name,
      item.schema,
      async (args, ctx) => {
        if (ctx.signal?.aborted) {
          throw new Error('tool_cancelled');
        }
        const onAbort = () => {
          rootAccessAdapter.cancelCommand(ctx.requestId).catch(() => {});
        };
        ctx.signal?.addEventListener('abort', onAbort);
        try {
          const result = await rootAccessAdapter.executeCommand(item.commandId, args, ctx.requestId);
          if (!result.ok) {
            throw new Error(result.error || 'execution_failed');
          }
          return result.valueJson || '{}';
        } finally {
          ctx.signal?.removeEventListener('abort', onAbort);
        }
      },
      { ownerId: OWNER, source: 'root', risk: item.risk },
    );
  }
  console.log('root_tools_ready');
};
