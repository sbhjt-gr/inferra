import { toolExecutor } from '../ToolExecutor';
import { toolRegistry } from '../ToolRegistry';

jest.mock('../ToolRegistry', () => ({
  toolRegistry: {
    isBuiltin: jest.fn().mockReturnValue(false),
    getExecutor: jest.fn(),
    getSchema: jest.fn(),
  },
}));

jest.mock('../../adapters/SkillActivityAdapter', () => ({
  skillActivityAdapter: {
    start: jest.fn().mockReturnValue('step'),
    done: jest.fn(),
  },
}));

describe('ToolExecutor structured outcomes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns invalid_arguments for missing required fields', async () => {
    (toolRegistry.getSchema as jest.Mock).mockReturnValue({
      function: { parameters: { required: ['query'] } },
    });
    (toolRegistry.getExecutor as jest.Mock).mockReturnValue(jest.fn());

    const outcome = await toolExecutor.executeStructured({
      id: '1',
      name: 'web_search',
      arguments: {},
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('invalid_arguments');
    }
  });

  it('returns tool_not_found when executor missing', async () => {
    (toolRegistry.getSchema as jest.Mock).mockReturnValue(null);
    (toolRegistry.getExecutor as jest.Mock).mockReturnValue(null);

    const outcome = await toolExecutor.executeStructured({
      id: '2',
      name: 'missing_tool',
      arguments: {},
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('tool_not_found');
    }
  });

  it('returns timeout on slow tools', async () => {
    (toolRegistry.getSchema as jest.Mock).mockReturnValue({ function: { parameters: {} } });
    (toolRegistry.getExecutor as jest.Mock).mockReturnValue(
      () => new Promise(resolve => setTimeout(() => resolve('late'), 50)),
    );

    const outcome = await toolExecutor.executeStructured(
      { id: '3', name: 'slow_tool', arguments: {} },
      { timeoutMs: 5 },
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('timeout');
      expect(outcome.error.retryable).toBe(true);
    }
  });
});
