import { toolRegistry, type ToolSchema } from './ToolRegistry';
import {
  formatSearchResponse,
  getSearchProvider,
  SearchProviderError,
} from '../search/SearchProvider';

const TOOL_NAME = 'web_search';

const WEB_SEARCH_TOOL: ToolSchema = {
  type: 'function',
  function: {
    name: TOOL_NAME,
    description:
      'Search the web for current information. Use for recent facts, news, release versions, or source-backed answers. Do not guess time-sensitive facts from memory.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A focused web search query.',
        },
        maxResults: {
          type: 'number',
          description: 'Optional number of results to return (1-10). Defaults to 6.',
        },
      },
      required: ['query'],
    },
  },
};

const cleanText = (value: unknown): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const clampMaxResults = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return 6;
  }
  return Math.min(Math.max(Math.floor(n), 1), 10);
};

export const executeWebSearch = async (args: Record<string, unknown>): Promise<string> => {
  const query = cleanText(args.query || args.q || args.text || '');
  if (!query) {
    return JSON.stringify({ error: 'No search query provided.', code: 'invalid_query' });
  }

  const maxResults = clampMaxResults(args.maxResults);
  try {
    const response = await getSearchProvider().search(query, maxResults);
    return formatSearchResponse(response);
  } catch (error) {
    if (error instanceof SearchProviderError) {
      return JSON.stringify({ error: error.message, code: error.code });
    }
    const message = error instanceof Error ? error.message : 'search_failed';
    return JSON.stringify({ error: message, code: 'provider_error' });
  }
};

export const registerWebSearch = (): void => {
  toolRegistry.unregister(TOOL_NAME);
  toolRegistry.register(TOOL_NAME, WEB_SEARCH_TOOL, executeWebSearch);
  console.log('web_search_tool_register');
};

export const unregisterWebSearch = (): void => {
  toolRegistry.unregister(TOOL_NAME);
};
