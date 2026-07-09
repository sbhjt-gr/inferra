import {
  litertToolSignature,
  toLitertToolsFromCatalog,
} from '../LitertToolsAdapter';
import type { RequestToolCatalog } from '../agent/AgentTypes';

const catalog: RequestToolCatalog = {
  tools: [],
  entries: [
    {
      name: 'web_search',
      description: 'Search the web',
      schema: {
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'query' },
              maxResults: { type: 'number', description: 'max' },
            },
            required: ['query'],
          },
        },
      },
    },
  ],
  functionSchemas: [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'query' },
            maxResults: { type: 'number', description: 'max' },
          },
          required: ['query'],
        },
      },
    },
  ],
};

describe('LitertToolsAdapter', () => {
  it('normalizes number params to integer', () => {
    const tools = toLitertToolsFromCatalog(catalog);
    const params = JSON.parse(tools[0].parametersJson);
    expect(params.properties.maxResults.type).toBe('integer');
    expect(params.properties.query.type).toBe('string');
  });

  it('builds stable signatures for unchanged catalogs', () => {
    const a = toLitertToolsFromCatalog(catalog);
    const b = toLitertToolsFromCatalog(catalog);
    expect(litertToolSignature(a)).toBe(litertToolSignature(b));
  });
});
