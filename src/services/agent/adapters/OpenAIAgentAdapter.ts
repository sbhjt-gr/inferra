import { OnlineModelService, onlineModelService, type ChatMessage } from '../../OnlineModelService';
import { generateRandomId } from '../../../utils/homeScreenUtils';
import type {
  AgentGenerationSettings,
  AgentMessage,
  AgentToolCall,
  ModelAdapter,
  ModelTurn,
  RequestToolCatalog,
  ToolOutcome,
} from '../AgentTypes';
import { outcomeToToolContent } from '../agentMessageUtils';

type OpenAIProviderState = {
  lastToolCalls?: AgentToolCall[];
  rawAssistant?: { content: string | null; tool_calls: any[] };
};

export class OpenAIAgentAdapter implements ModelAdapter {
  readonly id = 'openai';

  supports(provider: string): boolean {
    return OnlineModelService.getBaseProvider(provider) === 'chatgpt';
  }

  async nextTurn(
    messages: AgentMessage[],
    catalog: RequestToolCatalog,
    settings: AgentGenerationSettings,
    _providerState: unknown,
    opts: { onToken?: (token: string) => boolean | void; shouldCancel?: () => boolean },
  ): Promise<ModelTurn> {
    if (opts.shouldCancel?.()) {
      return { kind: 'final', text: '' };
    }
    const chatMessages: ChatMessage[] = messages.map(message => ({
      id: message.id,
      role: message.role,
      content: message.content,
      toolCallId: message.toolCallId,
    }));
    const response = await onlineModelService.sendOpenAIWithTools(
      chatMessages,
      catalog.tools,
      {
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        topP: settings.topP,
        stream: true,
        streamTokens: true,
      },
      opts.onToken,
    );

    if (response.toolCalls && response.toolCalls.length > 0) {
      const calls: AgentToolCall[] = response.toolCalls.map(call => ({
        id: call.id,
        name: call.function.name,
        arguments: JSON.parse(call.function.arguments || '{}'),
      }));
      const providerState: OpenAIProviderState = {
        lastToolCalls: calls,
        rawAssistant: {
          content: response.fullResponse || null,
          tool_calls: response.toolCalls.map(call => ({
            id: call.id,
            type: 'function',
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
            },
          })),
        },
      };
      return { kind: 'tool_calls', calls, providerState };
    }

    return { kind: 'final', text: (response.fullResponse || '').trim() };
  }

  appendToolOutcomes(
    messages: AgentMessage[],
    providerState: unknown,
    outcomes: ToolOutcome[],
  ): AgentMessage[] {
    const state = providerState as OpenAIProviderState;
    const next = [...messages];
    if (state.rawAssistant) {
      next.push({
        id: generateRandomId(),
        role: 'assistant',
        content: JSON.stringify({
          type: 'openai_tool_use_response',
          content: state.rawAssistant.content,
          tool_calls: state.rawAssistant.tool_calls,
        }),
      });
    }
    for (const outcome of outcomes) {
      next.push({
        id: generateRandomId(),
        role: 'tool',
        toolCallId: outcome.callId,
        content: outcomeToToolContent(outcome),
      });
    }
    return next;
  }
}
