import type { RequestToolCatalog } from '../agent/AgentTypes';
import type { ToolParam, ToolSchema } from '../tools/ToolRegistry';
import { toolRegistry } from '../tools/ToolRegistry';
import { toolPolicyStore } from '../capabilities/ToolPolicyStore';

export type LitertToolDef = {
  name: string;
  description: string;
  parametersJson: string;
};

const normalizeParamType = (param: ToolParam): string => {
  if (param.type === 'number') {
    return 'integer';
  }
  return param.type;
};

const normalizeParam = (param: ToolParam): Record<string, unknown> => {
  const entry: Record<string, unknown> = {
    type: normalizeParamType(param),
  };
  if (param.description) {
    entry.description = param.description;
  }
  if (param.enum?.length) {
    entry.enum = param.enum;
  }
  if (param.properties) {
    const properties: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(param.properties)) {
      properties[key] = normalizeParam(child);
    }
    entry.properties = properties;
    entry.required = param.required || [];
  }
  if (param.items) {
    entry.items = normalizeParam(param.items);
  }
  return entry;
};

const normalizeSchema = (schema: ToolSchema['function']['parameters']): Record<string, unknown> => {
  const properties: Record<string, unknown> = {};
  for (const [key, param] of Object.entries(schema.properties || {})) {
    properties[key] = normalizeParam(param);
  }
  return {
    type: 'object',
    properties,
    required: schema.required || [],
  };
};

const schemaToLitertTool = (schema: ToolSchema): LitertToolDef => ({
  name: schema.function.name,
  description: schema.function.description || '',
  parametersJson: JSON.stringify(normalizeSchema(schema.function.parameters)),
});

const isEligible = (schema: ToolSchema): boolean => {
  const meta = toolRegistry.getMeta(schema.function.name);
  if (!meta) {
    return false;
  }
  return toolPolicyStore.isAllowed(schema.function.name, meta.source);
};

export const toLitertToolsFromCatalog = (catalog: RequestToolCatalog): LitertToolDef[] => {
  return catalog.functionSchemas.filter(isEligible).map(schemaToLitertTool);
};

export const toLitertTools = (): LitertToolDef[] => {
  return toolRegistry.getCustomTools().filter(isEligible).map(schemaToLitertTool);
};

export const litertToolSignature = (tools: LitertToolDef[]): string => {
  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify(
    sorted.map(tool => ({
      name: tool.name,
      description: tool.description,
      parametersJson: tool.parametersJson,
    })),
  );
};
