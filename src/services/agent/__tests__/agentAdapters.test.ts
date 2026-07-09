import { OpenAIAgentAdapter } from '../adapters/OpenAIAgentAdapter';
import { ClaudeAgentAdapter } from '../adapters/ClaudeAgentAdapter';
import { GeminiAgentAdapter } from '../adapters/GeminiAgentAdapter';
import type { RequestToolCatalog, ToolOutcome } from '../AgentTypes';

const catalog: RequestToolCatalog = {
  tools: [],
  entries: [{ name: 'web_search', description: 'Search', schema: {} as any }],
  functionSchemas: [],
};

describe('agent adapter transcripts', () => {
  it('reinjects OpenAI tool results as role tool messages', () => {
    const adapter = new OpenAIAgentAdapter();
    const next = adapter.appendToolOutcomes(
      [{ id: 'u1', role: 'user', content: 'latest expo?' }],
      {
        rawAssistant: {
          content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'web_search', arguments: '{}' } }],
        },
      },
      [{ ok: true, callId: 'call_1', value: '{"result":"ok"}' } satisfies ToolOutcome],
    );

    expect(next).toHaveLength(3);
    expect(next[1].content).toContain('openai_tool_use_response');
    expect(next[2].role).toBe('tool');
    expect(next[2].toolCallId).toBe('call_1');
  });

  it('reinjects Claude tool_use and user tool_result messages', () => {
    const adapter = new ClaudeAgentAdapter();
    const next = adapter.appendToolOutcomes(
      [{ id: 'u1', role: 'user', content: 'weather?' }],
      { rawContent: [{ type: 'tool_use', id: 'tu_1', name: 'web_search', input: {} }] },
      [{ ok: true, callId: 'tu_1', value: 'sunny' }],
    );

    expect(next[1].content).toContain('tool_use_response');
    expect(next[2].role).toBe('user');
    expect(next[2].toolCallId).toBe('tu_1');
    expect(next[2].content).toBe('sunny');
  });

  it('reinjects Gemini function responses', () => {
    const adapter = new GeminiAgentAdapter();
    const next = adapter.appendToolOutcomes(
      [{ id: 'u1', role: 'user', content: 'news?' }],
      {
        modelParts: [{ functionCall: { name: 'web_search', args: { query: 'news' } } }],
        functionCalls: [{ id: 'fc_1', name: 'web_search', args: { query: 'news' } }],
      },
      [{ ok: false, callId: 'fc_1', error: { code: 'timeout', message: 'timed out' } }],
    );

    expect(next[1].content).toContain('gemini_tool_use_response');
    expect(next[2].content).toContain('function_response');
    expect(next[2].content).toContain('timed out');
  });

  it('supports provider lookup', () => {
    expect(new OpenAIAgentAdapter().supports('chatgpt')).toBe(true);
    expect(new ClaudeAgentAdapter().supports('claude')).toBe(true);
    expect(new GeminiAgentAdapter().supports('gemini_clone_a')).toBe(true);
    expect(catalog.entries[0].name).toBe('web_search');
  });
});
