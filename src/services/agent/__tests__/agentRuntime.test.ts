jest.mock('../../runtime-service', () => ({
  engineService: {
    ready: jest.fn().mockReturnValue(true),
    get: jest.fn().mockReturnValue('llama'),
    mgr: jest.fn().mockReturnValue({ gen: jest.fn().mockResolvedValue('') }),
  },
}));

jest.mock('../../AppleFoundationService', () => ({
  appleFoundationService: {
    isAvailable: jest.fn().mockReturnValue(false),
    isEnabled: jest.fn().mockResolvedValue(false),
    generateWithTools: jest.fn(),
  },
}));

import {
  agentRuntime,
  resetAgentAdaptersForTests,
  setAgentAdaptersForTests,
} from '../AgentRuntime';
import type { ModelAdapter, ModelTurn, RequestToolCatalog } from '../AgentTypes';
import { toolExecutor } from '../../tools/ToolExecutor';

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

const catalog: RequestToolCatalog = {
  tools: [],
  entries: [{ name: 'web_search', description: 'Search', schema: {} as any }],
  functionSchemas: [{} as any],
};

class MockAdapter implements ModelAdapter {
  readonly id = 'mock';
  private turn = 0;

  supports(): boolean {
    return true;
  }

  async nextTurn(): Promise<ModelTurn> {
    this.turn += 1;
    if (this.turn === 1) {
      return {
        kind: 'tool_calls',
        calls: [{ id: 'c1', name: 'web_search', arguments: { query: 'expo' } }],
        providerState: {},
      };
    }
    return { kind: 'final', text: 'Final answer' };
  }

  appendToolOutcomes(messages: any[], _state: unknown, outcomes: any[]) {
    return [
      ...messages,
      { id: 'tool', role: 'tool', content: outcomes[0].ok ? outcomes[0].value : outcomes[0].error.message },
    ];
  }
}

describe('AgentRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setAgentAdaptersForTests([new MockAdapter()]);
    (toolExecutor.executeAllStructured as jest.Mock).mockResolvedValue([
      { ok: true, callId: 'c1', value: '{"result":"ok"}' },
    ]);
  });

  afterEach(() => {
    resetAgentAdaptersForTests();
  });

  it('runs tool loop then returns final text', async () => {
    const result = await agentRuntime.run(
      'chatgpt',
      [{ role: 'user', content: 'latest expo?' }],
      { provider: 'chatgpt', settings: {} },
      catalog,
    );

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.text).toBe('Final answer');
    }
    expect(toolExecutor.executeAllStructured).toHaveBeenCalledTimes(1);
  });

  it('honours cancellation', async () => {
    const result = await agentRuntime.run(
      'chatgpt',
      [{ role: 'user', content: 'hi' }],
      { provider: 'chatgpt', settings: {}, shouldCancel: () => true },
      catalog,
    );
    expect(result.status).toBe('cancelled');
  });
});
