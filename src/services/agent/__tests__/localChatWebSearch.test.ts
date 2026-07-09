jest.mock('../../runtime-service', () => ({
  engineService: {
    ready: jest.fn().mockReturnValue(true),
    get: jest.fn().mockReturnValue('litert'),
    mgr: jest.fn().mockReturnValue({
      gen: jest
        .fn()
        .mockResolvedValueOnce('{"name":"web_search","arguments":{"query":"latest expo sdk"}}')
        .mockResolvedValueOnce('The latest Expo SDK is 54.'),
    }),
  },
}));

jest.mock('../../AppleFoundationService', () => ({
  appleFoundationService: {
    isAvailable: jest.fn().mockReturnValue(false),
    isEnabled: jest.fn().mockResolvedValue(false),
    generateWithTools: jest.fn(),
  },
}));

jest.mock('../../tools/ToolExecutor', () => ({
  toolExecutor: {
    hasReachedLimit: jest.fn((iteration: number) => iteration >= 3),
    executeAllStructured: jest.fn(),
  },
}));

jest.mock('../../tools/ToolRegistry', () => ({
  toolRegistry: {
    hasTools: jest.fn().mockReturnValue(true),
  },
}));

import { agentRuntime, resetAgentAdaptersForTests, setAgentAdaptersForTests } from '../AgentRuntime';
import { LocalPlannerAgentAdapter } from '../adapters/LocalPlannerAgentAdapter';
import type { RequestToolCatalog } from '../AgentTypes';
import { toolExecutor } from '../../tools/ToolExecutor';

const catalog: RequestToolCatalog = {
  tools: [],
  entries: [{ name: 'web_search', description: 'Search', schema: {} as any }],
  functionSchemas: [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    },
  ],
};

describe('local chat web search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setAgentAdaptersForTests([new LocalPlannerAgentAdapter()]);
    (toolExecutor.executeAllStructured as jest.Mock).mockResolvedValue([
      { ok: true, callId: 'call-1', value: '{"result":"expo 54"}' },
    ]);
  });

  afterEach(() => {
    resetAgentAdaptersForTests();
  });

  it('runs web_search then answers from tool result', async () => {
    const result = await agentRuntime.run(
      'local',
      [{ role: 'user', content: 'What is the latest Expo version?' }],
      { provider: 'local', settings: {} },
      catalog,
    );
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.text).toContain('Expo SDK');
    }
    expect(toolExecutor.executeAllStructured).toHaveBeenCalledTimes(1);
  });
});
