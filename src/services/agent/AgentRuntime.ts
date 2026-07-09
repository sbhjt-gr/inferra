import { toolExecutor } from '../tools/ToolExecutor';
import { toolRegistry } from '../tools/ToolRegistry';
import type {
  AgentMessage,
  AgentRunOptions,
  AgentRunResult,
  ModelAdapter,
  RequestToolCatalog,
} from './AgentTypes';
import { buildRequestToolCatalog } from './ToolCatalog';
import { ClaudeAgentAdapter } from './adapters/ClaudeAgentAdapter';
import { GeminiAgentAdapter } from './adapters/GeminiAgentAdapter';
import { LocalPlannerAgentAdapter } from './adapters/LocalPlannerAgentAdapter';
import { OpenAIAgentAdapter } from './adapters/OpenAIAgentAdapter';
import { AppleAgentAdapter } from './adapters/AppleAgentAdapter';
import { toAgentMessages } from './agentMessageUtils';

const DEFAULT_ADAPTERS: ModelAdapter[] = [
  new OpenAIAgentAdapter(),
  new ClaudeAgentAdapter(),
  new GeminiAgentAdapter(),
  new AppleAgentAdapter(),
  new LocalPlannerAgentAdapter(),
];

let activeAdapters: ModelAdapter[] = [...DEFAULT_ADAPTERS];

export const setAgentAdaptersForTests = (adapters: ModelAdapter[]): void => {
  activeAdapters = adapters;
};

export const resetAgentAdaptersForTests = (): void => {
  activeAdapters = [...DEFAULT_ADAPTERS];
};

export const resolveModelAdapter = (provider: string): ModelAdapter | null => {
  return activeAdapters.find(adapter => adapter.supports(provider)) || null;
};

class AgentRuntimeClass {
  async run(
    provider: string,
    messages: Array<{ id?: string; role: string; content: string; toolCallId?: string }>,
    opts: AgentRunOptions,
    catalog: RequestToolCatalog = buildRequestToolCatalog(),
  ): Promise<AgentRunResult> {
    if (!toolRegistry.hasTools() || catalog.functionSchemas.length === 0) {
      return { status: 'failed', error: { code: 'provider_error', message: 'No tools available.' } };
    }

    const adapter = resolveModelAdapter(provider);
    if (!adapter) {
      return { status: 'failed', error: { code: 'provider_error', message: `Unsupported provider: ${provider}` } };
    }

    let loopMessages: AgentMessage[] = toAgentMessages(messages);
    let iteration = 0;
    let providerState: unknown = null;

    console.log('agent_runtime_start', { provider, adapter: adapter.id, toolCount: catalog.functionSchemas.length });

    while (!toolExecutor.hasReachedLimit(iteration)) {
      if (opts.shouldCancel?.()) {
        return { status: 'cancelled' };
      }

      iteration += 1;
      let turn;
      try {
        turn = await adapter.nextTurn(loopMessages, catalog, opts.settings, providerState, {
          onToken: opts.onToken,
          shouldCancel: opts.shouldCancel,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'provider_error';
        console.log('agent_runtime_turn_fail', { iteration, message });
        return { status: 'failed', error: { code: 'provider_error', message, retryable: true } };
      }

      if (turn.kind === 'final') {
        const text = turn.text.trim();
        console.log('agent_runtime_final', { iteration, len: text.length });
        return { status: 'completed', text };
      }

      opts.onToolRound?.();
      console.log('agent_runtime_tools', { iteration, count: turn.calls.length });
      const outcomes = await toolExecutor.executeAllStructured(turn.calls);
      loopMessages = adapter.appendToolOutcomes(loopMessages, turn.providerState, outcomes);
      providerState = turn.providerState;
    }

    console.log('agent_runtime_limit');
    return { status: 'loop_limit' };
  }
}

export const agentRuntime = new AgentRuntimeClass();
