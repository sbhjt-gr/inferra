jest.mock('../../runtime-service', () => ({
  engineService: {
    ready: jest.fn().mockReturnValue(true),
    get: jest.fn().mockReturnValue('litert'),
    mgr: jest.fn(),
  },
}));

import { engineService } from '../../runtime-service';
import { LocalPlannerAgentAdapter } from '../adapters/LocalPlannerAgentAdapter';
import type { RequestToolCatalog } from '../AgentTypes';

const catalog: RequestToolCatalog = {
  tools: [],
  entries: [{ name: 'web_search', description: 'Search', schema: {} as any }],
  functionSchemas: [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    },
  ],
};

describe('LocalPlannerAgentAdapter litert', () => {
  const gen = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (engineService.mgr as jest.Mock).mockReturnValue({ gen });
    (engineService.get as jest.Mock).mockReturnValue('litert');
    (engineService.ready as jest.Mock).mockReturnValue(true);
  });

  it('returns final text for greetings without tool calls', async () => {
    gen.mockResolvedValue('Hello! How can I help?');
    const adapter = new LocalPlannerAgentAdapter();
    const turn = await adapter.nextTurn(
      [{ id: '1', role: 'user', content: 'Hi' }],
      catalog,
      {},
      null,
      {},
    );
    expect(turn.kind).toBe('final');
    if (turn.kind === 'final') {
      expect(turn.text).toContain('Hello');
    }
    expect(gen).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ tools: expect.any(Array) }),
    );
  });

  it('selects web_search from native envelope', async () => {
    gen.mockResolvedValue('{"name":"web_search","arguments":{"query":"latest expo sdk"}}');
    const adapter = new LocalPlannerAgentAdapter();
    const turn = await adapter.nextTurn(
      [{ id: '1', role: 'user', content: 'What is the latest Expo version?' }],
      catalog,
      {},
      null,
      {},
    );
    expect(turn.kind).toBe('tool_calls');
    if (turn.kind === 'tool_calls') {
      expect(turn.calls[0].name).toBe('web_search');
      expect(turn.calls[0].arguments.query).toBe('latest expo sdk');
    }
  });

  it('falls back to plain chat when native tools fail', async () => {
    gen.mockRejectedValueOnce(new Error('invoke_fail'));
    gen.mockResolvedValueOnce('Fallback answer');
    const adapter = new LocalPlannerAgentAdapter();
    const turn = await adapter.nextTurn(
      [{ id: '1', role: 'user', content: 'Hi' }],
      catalog,
      {},
      null,
      {},
    );
    expect(turn.kind).toBe('final');
    if (turn.kind === 'final') {
      expect(turn.text).toBe('Fallback answer');
    }
    expect(gen).toHaveBeenCalledTimes(2);
    expect(gen.mock.calls[1][1].tools).toBeUndefined();
  });

  it('reinjects tool outcomes for continuation', () => {
    const adapter = new LocalPlannerAgentAdapter();
    const next = adapter.appendToolOutcomes(
      [{ id: '1', role: 'user', content: 'latest expo?' }],
      {},
      [{ ok: true, callId: 'c1', value: '{"result":"ok"}' }],
    );
    expect(next[1].content).toContain('Tool result for c1');
  });
});
