export type ToolRisk = 'read' | 'write' | 'destructive';

export type ToolSource = 'stock' | 'app_functions' | 'root' | 'skill' | 'builtin';

export type ToolParam = {
  type: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, ToolParam>;
  required?: string[];
  items?: ToolParam;
  additionalProperties?: boolean | ToolParam;
};

export type ToolSchema = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParam>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
};

export type BuiltinTool = {
  type: string;
};

export type Tool = ToolSchema | BuiltinTool;

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type ToolResult = {
  toolCallId: string;
  content: string;
};

export type ToolMeta = {
  source: ToolSource;
  risk: ToolRisk;
  ownerId: string;
};

export type ToolExecuteContext = {
  signal?: AbortSignal;
  requestId: string;
};

export type ToolExecuteFn = (
  args: Record<string, unknown>,
  ctx: ToolExecuteContext,
) => Promise<string>;

type RegisteredTool = {
  schema: ToolSchema;
  execute: ToolExecuteFn;
  meta: ToolMeta;
};

class ToolRegistryClass {
  private tools = new Map<string, RegisteredTool>();
  private builtins = new Map<string, BuiltinTool>();

  register(
    name: string,
    schema: ToolSchema,
    execute: ToolExecuteFn,
    meta: Partial<ToolMeta> & { ownerId: string },
  ): () => void {
    console.log('tool_register', name, meta.ownerId);
    this.tools.set(name, {
      schema,
      execute,
      meta: {
        source: meta.source ?? 'stock',
        risk: meta.risk ?? 'read',
        ownerId: meta.ownerId,
      },
    });
    return () => this.unregisterOwned(name, meta.ownerId);
  }

  registerBuiltin(name: string, tool: BuiltinTool): void {
    this.builtins.set(name, tool);
  }

  unregister(name: string): void {
    console.log('tool_unregister', name);
    this.tools.delete(name);
    this.builtins.delete(name);
  }

  unregisterOwned(name: string, ownerId: string): boolean {
    const entry = this.tools.get(name);
    if (!entry) {
      return false;
    }
    if (entry.meta.ownerId !== ownerId) {
      console.log('tool_unregister_skip', name);
      return false;
    }
    console.log('tool_unregister_owned', name);
    this.tools.delete(name);
    return true;
  }

  unregisterByOwner(ownerId: string): string[] {
    const removed: string[] = [];
    for (const [name, entry] of this.tools.entries()) {
      if (entry.meta.ownerId === ownerId) {
        this.tools.delete(name);
        removed.push(name);
      }
    }
    console.log('tool_unregister_owner', ownerId, removed.length);
    return removed;
  }

  getSchema(name: string): ToolSchema | undefined {
    return this.tools.get(name)?.schema;
  }

  getExecutor(name: string): ToolExecuteFn | undefined {
    return this.tools.get(name)?.execute;
  }

  getMeta(name: string): ToolMeta | undefined {
    return this.tools.get(name)?.meta;
  }

  isBuiltin(name: string): boolean {
    return this.builtins.has(name);
  }

  getBuiltin(name: string): BuiltinTool | undefined {
    return this.builtins.get(name);
  }

  getAllTools(): Tool[] {
    const custom = Array.from(this.tools.values()).map(t => t.schema);
    const builtin = Array.from(this.builtins.values());
    return [...builtin, ...custom];
  }

  getCustomTools(): ToolSchema[] {
    return Array.from(this.tools.values()).map(t => t.schema);
  }

  getBuiltinTools(): BuiltinTool[] {
    return Array.from(this.builtins.values());
  }

  getToolsBySource(source: ToolSource): ToolSchema[] {
    return Array.from(this.tools.values())
      .filter(t => t.meta.source === source)
      .map(t => t.schema);
  }

  hasTools(): boolean {
    return this.tools.size > 0 || this.builtins.size > 0;
  }

  clear(): void {
    this.tools.clear();
    this.builtins.clear();
  }
}

export const toolRegistry = new ToolRegistryClass();
