import { toolRegistry, type Tool, type ToolSchema } from '../tools/ToolRegistry';
import type { CatalogEntry, RequestToolCatalog } from './AgentTypes';

const isFunctionTool = (tool: Tool): tool is ToolSchema => 'function' in tool;

export const buildRequestToolCatalog = (): RequestToolCatalog => {
  const tools = toolRegistry.getAllTools();
  const functionSchemas = tools.filter(isFunctionTool);
  const entries: CatalogEntry[] = functionSchemas.map(schema => ({
    name: schema.function.name,
    description: schema.function.description,
    schema,
  }));
  return { tools, entries, functionSchemas };
};

export const buildCompactToolList = (catalog: RequestToolCatalog, max = 16): string => {
  const slice = catalog.entries.slice(0, max);
  const lines = slice.map(entry => `- ${entry.name}: ${entry.description}`);
  const more = catalog.entries.length > max ? `\n...and ${catalog.entries.length - max} more` : '';
  return lines.join('\n') + more;
};
