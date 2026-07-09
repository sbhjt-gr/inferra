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

type ClaudeProviderState = {
  rawContent?: any[];
};

export class ClaudeAgentAdapter implements ModelAdapter {
  readonly id = 'claude';

  supports(provider: string): boolean {
    return OnlineModelService.getBaseProvider(provider) === 'claude';
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
      role: message.role === 'tool' ? 'user' : message.role,
      content: message.content,
      toolCallId: message.toolCallId,
    }));
    const response = await onlineModelService.sendClaudeWithTools(
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
      return {
        kind: 'tool_calls',
        calls,
        providerState: { rawContent: response.rawContent || [] } satisfies ClaudeProviderState,
      };
    }

    return { kind: 'final', text: (response.fullResponse || '').trim() };
  }

  appendToolOutcomes(
    messages: AgentMessage[],
    providerState: unknown,
    outcomes: ToolOutcome[],
  ): AgentMessage[] {
    const state = providerState as ClaudeProviderState;
    const next = [...messages];
    if (state.rawContent) {
      next.push({
        id: generateRandomId(),
        role: 'assistant',
        content: JSON.stringify({
          type: 'tool_use_response',
          rawContent: state.rawContent,
        }),
      });
    }
    for (const outcome of outcomes) {
      next.push({
        id: generateRandomId(),
        role: 'user',
        toolCallId: outcome.callId,
        content: outcomeToToolContent(outcome),
      });
    }
    return next;
  }
}
