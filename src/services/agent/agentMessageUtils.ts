import { generateRandomId } from '../../utils/homeScreenUtils';
import type { AgentMessage, AgentToolCall, ToolOutcome } from './AgentTypes';

export const toAgentMessages = (messages: Array<{ id?: string; role: string; content: string; toolCallId?: string }>): AgentMessage[] => {
  return messages
    .filter(entry => ['system', 'user', 'assistant', 'tool'].includes(entry.role))
    .map(entry => ({
      id: entry.id || generateRandomId(),
      role: entry.role as AgentMessage['role'],
      content: typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content),
      toolCallId: entry.toolCallId,
    }));
};

export const outcomeToToolContent = (outcome: ToolOutcome): string => {
  if (outcome.ok) {
    return outcome.value;
  }
  return JSON.stringify({ error: outcome.error.message, code: outcome.error.code });
};

export const parsePlannerToolCall = (text: string): AgentToolCall | null => {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const candidates = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    candidates.unshift(fence[1].trim());
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const name = String(parsed.name || parsed.tool || '').trim();
      if (!name) {
        continue;
      }
      const args = parsed.arguments ?? parsed.parameters ?? parsed.args ?? {};
      const normalized =
        typeof args === 'string'
          ? (JSON.parse(args) as Record<string, unknown>)
          : (args as Record<string, unknown>);
      return {
        id: generateRandomId(),
        name,
        arguments: normalized && typeof normalized === 'object' ? normalized : {},
      };
    } catch {
    }
  }
  return null;
};

export const buildPlannerPrompt = (toolList: string, userText: string): string => {
  return `You are a tool router. Pick at most one tool call for the user message.

Available tools:
${toolList}

Reply with ONLY one JSON object:
{"action":"none"}
or
{"name":"<tool_name>","arguments":{...}}

Use none for normal chat. Use a tool only when the user clearly needs it now.

User message: ${userText}

JSON:`;
};
