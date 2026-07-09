import { agentRuntime } from './agent/AgentRuntime';
import { buildRequestToolCatalog } from './agent/ToolCatalog';
import { onlineModelService, type ChatMessage, type OnlineModelRequestOptions } from './OnlineModelService';
import { toolRegistry } from './tools/ToolRegistry';
import { generateRandomId } from '../utils/homeScreenUtils';

export type ToolAgentCallbacks = {
  onStatus?: (status: string) => void;
};

class ToolAgentService {
  async run(
    provider: string,
    messages: ChatMessage[],
    options: OnlineModelRequestOptions = {},
    callbacks: ToolAgentCallbacks = {},
  ): Promise<{ messages: ChatMessage[]; finalText: string }> {
    const loopMessages: ChatMessage[] = [...messages];

    if (!toolRegistry.hasTools()) {
      const finalText = await onlineModelService.sendMessage(provider, loopMessages, options);
      return {
        messages: [
          ...loopMessages,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: finalText,
          },
        ],
        finalText,
      };
    }

    callbacks.onStatus?.('tool_loop_1');
    const result = await agentRuntime.run(
      provider,
      loopMessages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        toolCallId: msg.toolCallId,
      })),
      {
        provider,
        settings: {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP,
        },
      },
      buildRequestToolCatalog(),
    );

    if (result.status === 'completed') {
      const finalText = result.text || '';
      return {
        messages: [
          ...loopMessages,
          {
            id: generateRandomId(),
            role: 'assistant',
            content: finalText,
          },
        ],
        finalText,
      };
    }

    if (result.status === 'loop_limit') {
      throw new Error('tool_loop_limit_reached');
    }

    const message = result.status === 'failed' ? result.error.message : 'tool_agent_cancelled';
    throw new Error(message);
  }
}

export const toolAgentService = new ToolAgentService();
