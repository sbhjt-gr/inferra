import { validateToolArgs } from '../ToolValidator';
import type { ToolSchema } from '../ToolRegistry';

describe('ToolValidator', () => {
  const schema: ToolSchema = {
    type: 'function',
    function: {
      name: 'demo',
      description: 'demo',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          count: { type: 'integer' },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
  };

  it('accepts valid args', () => {
    expect(validateToolArgs('demo', schema, { name: 'a', count: 1 })).toBeNull();
  });

  it('rejects unknown fields', () => {
    const err = validateToolArgs('demo', schema, { name: 'a', extra: true });
    expect(err?.code).toBe('invalid_arguments');
  });

  it('rejects missing required', () => {
    const err = validateToolArgs('demo', schema, {});
    expect(err?.code).toBe('invalid_arguments');
  });
});
