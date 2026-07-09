import { generateRandomId } from '../../../utils/homeScreenUtils';
import { appleFoundationService } from '../../AppleFoundationService';
import { toolRegistry } from '../../tools/ToolRegistry';
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

type AppleToolDef = {
  id: string;
  name: string;
  description: string;
  parametersJson: string;
};

const toAppleTools = (catalog: RequestToolCatalog): AppleToolDef[] => {
  return catalog.functionSchemas.map(schema => ({
    id: generateRandomId(),
    name: schema.function.name,
    description: schema.function.description,
    parametersJson: JSON.stringify(schema.function.parameters || { type: 'object', properties: {} }),
  }));
};

export class AppleAgentAdapter implements ModelAdapter {
  readonly id = 'apple';

  supports(provider: string): boolean {
    return provider === 'apple-foundation';
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
    if (!appleFoundationService.isAvailable() || !(await appleFoundationService.isEnabled())) {
      return { kind: 'final', text: '' };
    }

    const mapped = messages
      .filter(entry => entry.role !== 'tool')
      .map(entry => ({
        role: entry.role as 'system' | 'user' | 'assistant',
        content: entry.content,
      }));

    const result = await appleFoundationService.generateWithTools(mapped, toAppleTools(catalog), {
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      topP: settings.topP,
      topK: settings.topK,
    });

    if (result.toolCalls.length > 0) {
      const hostCalls = result.toolCalls.filter(call => !toolRegistry.isBuiltin(call.name));
      if (hostCalls.length > 0) {
        return { kind: 'tool_calls', calls: hostCalls, providerState: { text: result.text } };
      }
    }

    const text = (result.text || '').trim();
    if (text) {
      opts.onToken?.(text);
    }
    return { kind: 'final', text };
  }

  appendToolOutcomes(
    messages: AgentMessage[],
    providerState: unknown,
    outcomes: ToolOutcome[],
  ): AgentMessage[] {
    const state = providerState as { text?: string };
    const next = [...messages];
    if (state.text) {
      next.push({
        id: generateRandomId(),
        role: 'assistant',
        content: state.text,
      });
    }
    for (const outcome of outcomes) {
      next.push({
        id: generateRandomId(),
        role: 'user',
        content: `Tool result for ${outcome.callId}: ${outcomeToToolContent(outcome)}`,
      });
    }
    return next;
  }
}
