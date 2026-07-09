import { parseLitertToolEnvelope } from '../agentMessageUtils';

describe('parseLitertToolEnvelope', () => {
  it('parses schema-constrained tool json', () => {
    const call = parseLitertToolEnvelope('{"name":"web_search","arguments":{"query":"expo sdk"}}');
    expect(call?.name).toBe('web_search');
    expect(call?.arguments.query).toBe('expo sdk');
  });

  it('ignores conversational prose', () => {
    expect(parseLitertToolEnvelope('I cannot search the web.')).toBeNull();
  });

  it('ignores action none envelopes', () => {
    expect(parseLitertToolEnvelope('{"action":"none"}')).toBeNull();
  });
});
