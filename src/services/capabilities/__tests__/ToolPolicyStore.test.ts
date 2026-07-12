const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  removeItem: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

import { toolPolicyStore } from '../ToolPolicyStore';

describe('ToolPolicyStore', () => {
  it('blocks elevated tools until global enabled', async () => {
    await toolPolicyStore.load();
    await toolPolicyStore.setGlobal(false);
    expect(toolPolicyStore.isAllowed('device_health', 'root')).toBe(false);
    await toolPolicyStore.setGlobal(true);
    await toolPolicyStore.setSource('root', true);
    expect(toolPolicyStore.isAllowed('device_health', 'root')).toBe(true);
    await toolPolicyStore.setEmergency(true);
    expect(toolPolicyStore.isAllowed('device_health', 'root')).toBe(false);
    await toolPolicyStore.setEmergency(false);
    await toolPolicyStore.setGlobal(false);
  });
});
