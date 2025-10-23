import { type ModelSettings } from '../../ModelSettingsService';

export function parseMessagesFromPayload(payload: any): {
  messages: Array<{ role: string; content: string }>;
  error?: string;
} {
  if (!payload || !Array.isArray(payload.messages)) {
    return { messages: [], error: 'messages_required' };
  }

  const messages: Array<{ role: string; content: string }> = [];
  const systemInputs: string[] = [];

  if (payload.options && typeof payload.options.system_prompt === 'string' && payload.options.system_prompt.length > 0) {
    systemInputs.push(payload.options.system_prompt);
  }

  if (typeof payload.system === 'string' && payload.system.length > 0) {
    systemInputs.push(payload.system);
  }

  for (const entry of payload.messages) {
    if (!entry || typeof entry.role !== 'string') {
      continue;
    }

    let content = '';

    if (typeof entry.content === 'string') {
      content = entry.content;
    } else if (Array.isArray(entry.content)) {
      content = entry.content
        .map((item: any) => {
          if (typeof item === 'string') {
            return item;
          }
          if (item && typeof item.text === 'string') {
            return item.text;
          }
          return '';
        })
        .filter((value: string) => value.length > 0)
        .join(' ');
    } else if (entry.content && typeof entry.content === 'object' && typeof entry.content.text === 'string') {
      content = entry.content.text;
    } else if (entry.content !== undefined && entry.content !== null) {
      content = String(entry.content);
    }

    messages.push({ role: entry.role, content });
  }

  for (let index = systemInputs.length - 1; index >= 0; index -= 1) {
    const systemContent = systemInputs[index];
    messages.unshift({ role: 'system', content: systemContent });
  }

  if (messages.length === 0) {
    return { messages: [], error: 'messages_required' };
  }

  return { messages };
}

export function parseMessagesOrPromptFromPayload(payload: any): {
  messages: Array<{ role: string; content: string }>;
  error?: string;
} {
  const messages: Array<{ role: string; content: string }> = [];
  const systemInputs: string[] = [];

  if (typeof payload.system === 'string' && payload.system.length > 0) {
    systemInputs.push(payload.system);
  }

  if (payload.options && typeof payload.options.system_prompt === 'string' && payload.options.system_prompt.length > 0) {
    systemInputs.push(payload.options.system_prompt);
  }

  if (Array.isArray(payload.messages) && payload.messages.length > 0) {
    for (const entry of payload.messages) {
      if (!entry || typeof entry.role !== 'string') {
        continue;
      }

      let content = '';

      if (typeof entry.content === 'string') {
        content = entry.content;
      } else if (Array.isArray(entry.content)) {
        content = entry.content
          .map((item: any) => {
            if (typeof item === 'string') {
              return item;
            }
            if (item && typeof item.text === 'string') {
              return item.text;
            }
            return '';
          })
          .filter((value: string) => value.length > 0)
          .join(' ');
      } else if (entry.content && typeof entry.content === 'object' && typeof entry.content.text === 'string') {
        content = entry.content.text;
      } else if (entry.content !== undefined && entry.content !== null) {
        content = String(entry.content);
      }

      messages.push({ role: entry.role, content });
    }
  } else if (typeof payload.prompt === 'string') {
    messages.push({ role: 'user', content: payload.prompt });
  }

  for (let index = systemInputs.length - 1; index >= 0; index -= 1) {
    const systemContent = systemInputs[index];
    messages.unshift({ role: 'system', content: systemContent });
  }

  if (messages.length === 0) {
    return { messages: [], error: 'prompt_required' };
  }

  return { messages };
}
