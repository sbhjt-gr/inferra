import { parsePlannerToolCall, outcomeToToolContent } from '../agentMessageUtils';

describe('agentMessageUtils', () => {
  it('parses planner tool envelope', () => {
    const call = parsePlannerToolCall('{"name":"web_search","arguments":{"query":"expo sdk"}}');
    expect(call?.name).toBe('web_search');
    expect(call?.arguments.query).toBe('expo sdk');
  });

  it('parses fenced planner json', () => {
    const call = parsePlannerToolCall('```json\n{"tool":"web_search","args":{"query":"news"}}\n```');
    expect(call?.name).toBe('web_search');
    expect(call?.arguments.query).toBe('news');
  });

  it('returns null for conversational text', () => {
    expect(parsePlannerToolCall('Hello there!')).toBeNull();
  });

  it('formats structured tool errors', () => {
    const content = outcomeToToolContent({
      ok: false,
      callId: '1',
      error: { code: 'invalid_arguments', message: 'Missing query' },
    });
    expect(content).toContain('Missing query');
    expect(content).toContain('invalid_arguments');
  });
});
