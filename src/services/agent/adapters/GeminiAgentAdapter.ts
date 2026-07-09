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

type GeminiProviderState = {
  modelParts?: any[];
  functionCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
};

export class GeminiAgentAdapter implements ModelAdapter {
  readonly id = 'gemini';

  supports(provider: string): boolean {
    return OnlineModelService.getBaseProvider(provider) === 'gemini';
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
    const response = await onlineModelService.sendGeminiWithTools(
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
        providerState: {
          modelParts: (response as any).rawParts || [],
          functionCalls: calls.map(call => ({ id: call.id, name: call.name, args: call.arguments })),
        } satisfies GeminiProviderState,
      };
    }

    return { kind: 'final', text: (response.fullResponse || '').trim() };
  }

  appendToolOutcomes(
    messages: AgentMessage[],
    providerState: unknown,
    outcomes: ToolOutcome[],
  ): AgentMessage[] {
    const state = providerState as GeminiProviderState;
    const next = [...messages];
    if (state.modelParts) {
      next.push({
        id: generateRandomId(),
        role: 'assistant',
        content: JSON.stringify({
          type: 'gemini_tool_use_response',
          rawParts: state.modelParts,
        }),
      });
    }
    for (const outcome of outcomes) {
      const call = state.functionCalls?.find(entry => entry.id === outcome.callId);
      next.push({
        id: generateRandomId(),
        role: 'user',
        toolCallId: outcome.callId,
        content: JSON.stringify({
          type: 'function_response',
          id: outcome.callId,
          name: call?.name || 'tool_result',
          response: { result: outcomeToToolContent(outcome) },
        }),
      });
    }
    return next;
  }
}
