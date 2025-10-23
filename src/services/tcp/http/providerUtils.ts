import type { ProviderType } from '../../ModelManagementService';

export function normalizeProvider(value: any): ProviderType | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.toLowerCase();

  if (
    normalized === 'gemini' ||
    normalized === 'chatgpt' ||
    normalized === 'deepseek' ||
    normalized === 'claude' ||
    normalized === 'apple-foundation'
  ) {
    return normalized;
  }

  if (normalized === 'local' || normalized === 'llama') {
    return 'local';
  }

  return undefined;
}
