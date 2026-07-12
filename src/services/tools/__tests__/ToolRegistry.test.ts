import { toolRegistry } from '../ToolRegistry';

describe('ToolRegistry ownership', () => {
  afterEach(() => {
    toolRegistry.clear();
  });

  it('does not unregister other owners', () => {
    toolRegistry.register(
      'demo',
      {
        type: 'function',
        function: {
          name: 'demo',
          description: 'd',
          parameters: { type: 'object', properties: {} },
        },
      },
      async () => 'ok',
      { ownerId: 'a', source: 'stock', risk: 'read' },
    );
    expect(toolRegistry.unregisterOwned('demo', 'b')).toBe(false);
    expect(toolRegistry.getSchema('demo')).toBeTruthy();
    expect(toolRegistry.unregisterOwned('demo', 'a')).toBe(true);
    expect(toolRegistry.getSchema('demo')).toBeUndefined();
  });
});
