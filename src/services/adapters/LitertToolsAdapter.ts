import type { RequestToolCatalog } from '../agent/AgentTypes';
import type { ToolParam, ToolSchema } from '../tools/ToolRegistry';
import { toolRegistry } from '../tools/ToolRegistry';

export type LitertToolDef = {
  name: string;
  description: string;
  parametersJson: string;
};

const LITERT_NATIVE_TOOLS = new Set(['web_search']);

const normalizeParamType = (param: ToolParam): string => {
  if (param.type === 'number') {
    return 'integer';
  }
  return param.type;
};

const normalizeSchema = (schema: ToolSchema['function']['parameters']): Record<string, unknown> => {
  const properties: Record<string, unknown> = {};
  for (const [key, param] of Object.entries(schema.properties || {})) {
    const entry: Record<string, unknown> = {
      type: normalizeParamType(param),
    };
    if (param.description) {
      entry.description = param.description;
    }
    if (param.enum?.length) {
      entry.enum = param.enum;
    }
    properties[key] = entry;
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

export const toLitertToolsFromCatalog = (catalog: RequestToolCatalog): LitertToolDef[] => {
  return catalog.functionSchemas
    .filter(schema => LITERT_NATIVE_TOOLS.has(schema.function.name))
    .map(schemaToLitertTool);
};

export const toLitertTools = (): LitertToolDef[] => {
  return toolRegistry.getCustomTools().map(schemaToLitertTool);
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
