import { engineService } from '../../runtime-service';
import { toLitertToolsFromCatalog, type LitertToolDef } from '../../adapters/LitertToolsAdapter';
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
import {
  buildPlannerPrompt,
  outcomeToToolContent,
  parseLitertToolEnvelope,
  parsePlannerToolCall,
} from '../agentMessageUtils';
import { buildCompactToolList } from '../ToolCatalog';

const parsePlannerResponse = (text: string): AgentToolCall | null => {
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
      if (String(parsed.action || '').trim() === 'none') {
        return null;
      }
      const direct = parsePlannerToolCall(candidate);
      if (direct) {
        return direct;
      }
      const name = String(parsed.name || parsed.tool || '').trim();
      if (!name) {
        continue;
      }
      const args = parsed.arguments ?? parsed.parameters ?? parsed.args ?? {};
      return {
        id: generateRandomId(),
        name,
        arguments: typeof args === 'object' && args ? (args as Record<string, unknown>) : {},
      };
    } catch {
    }
  }
  return parsePlannerToolCall(trimmed);
};

type LocalProviderState = {
  plannerAttempted?: boolean;
};

const getLastUserText = (messages: AgentMessage[]): string => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      return messages[i].content.trim();
    }
  }
  return '';
};

export class LocalPlannerAgentAdapter implements ModelAdapter {
  readonly id = 'local-planner';

  supports(provider: string): boolean {
    return provider === 'local';
  }

  private async generateText(
    messages: AgentMessage[],
    settings: AgentGenerationSettings,
    opts: { onToken?: (token: string) => boolean | void; tools?: LitertToolDef[]; skipStableTools?: boolean },
  ): Promise<string> {
    const mapped = messages.map(entry => ({
      role: entry.role === 'tool' ? 'user' : entry.role,
      content: entry.role === 'tool'
        ? `Tool result (${entry.toolCallId || 'unknown'}): ${entry.content}`
        : entry.content,
    }));
    return engineService.mgr().gen(mapped as any, {
      onToken: opts.onToken,
      settings: {
        ...settings,
        maxTokens: Math.min(settings.maxTokens || 1024, 1024),
      },
      tools: opts.tools,
      skipStableTools: opts.skipStableTools,
    });
  }

  async nextTurn(
    messages: AgentMessage[],
    catalog: RequestToolCatalog,
    settings: AgentGenerationSettings,
    providerState: unknown,
    opts: { onToken?: (token: string) => boolean | void; shouldCancel?: () => boolean },
  ): Promise<ModelTurn> {
    if (opts.shouldCancel?.() || !engineService.ready()) {
      return { kind: 'final', text: '' };
    }

    const state = (providerState as LocalProviderState | null) || {};
    const engine = engineService.get();
    const isLitert = engine === 'litert';
    const isToolContinuation = messages.some(
      entry => entry.role === 'user' && entry.content.startsWith('Tool result for '),
    );

    if (isLitert) {
      const litertTools = catalog.functionSchemas.length > 0
        ? toLitertToolsFromCatalog(catalog)
        : undefined;
      console.log('local_litert_tools', {
        count: litertTools?.length ?? 0,
        continuation: isToolContinuation,
      });
      try {
        const response = await this.generateText(messages, settings, {
          onToken: opts.onToken,
          tools: litertTools,
        });
        const toolCall = parseLitertToolEnvelope(response);
        if (toolCall && catalog.entries.some(entry => entry.name === toolCall.name)) {
          console.log('local_litert_tool_call', { name: toolCall.name });
          return { kind: 'tool_calls', calls: [toolCall], providerState: state };
        }
        return { kind: 'final', text: response.trim() };
      } catch (error) {
        console.log('local_litert_fail', error instanceof Error ? error.message : 'unknown');
        const fallback = await this.generateText(messages, settings, {
          onToken: opts.onToken,
          skipStableTools: true,
        });
        return { kind: 'final', text: fallback.trim() };
      }
    }

    if (!state.plannerAttempted && !isToolContinuation) {
      const userText = getLastUserText(messages);
      if (userText) {
        try {
          const planned = await this.planToolCall(userText, catalog, settings);
          if (planned && catalog.entries.some(entry => entry.name === planned.name)) {
            return {
              kind: 'tool_calls',
              calls: [planned],
              providerState: { plannerAttempted: true } satisfies LocalProviderState,
            };
          }
        } catch (error) {
          console.log('local_planner_fail', error instanceof Error ? error.message : 'unknown');
        }
      }
      state.plannerAttempted = true;
    }

    const response = await this.generateText(messages, settings, { onToken: opts.onToken });
    const toolCall = parsePlannerToolCall(response) || parsePlannerResponse(response);
    if (toolCall && catalog.entries.some(entry => entry.name === toolCall.name)) {
      return { kind: 'tool_calls', calls: [toolCall], providerState: state };
    }

    return { kind: 'final', text: response.trim() };
  }

  async planToolCall(
    userText: string,
    catalog: RequestToolCatalog,
    settings: AgentGenerationSettings,
  ): Promise<AgentToolCall | null> {
    if (!engineService.ready() || catalog.entries.length === 0) {
      return null;
    }
    if (engineService.get() === 'litert') {
      console.log('local_plan_skip_litert');
      return null;
    }
    const prompt = buildPlannerPrompt(buildCompactToolList(catalog), userText);
    try {
      console.log('local_plan_invoke', { toolCount: catalog.entries.length });
      const raw = await engineService.mgr().gen(
        [{ role: 'user', content: prompt }] as any,
        {
          settings: {
            ...settings,
            systemPrompt: '',
            maxTokens: Math.min(settings.maxTokens || 256, 256),
            temperature: 0.1,
          },
        },
      );
      return parsePlannerResponse(raw);
    } catch (error) {
      console.log('local_plan_invoke_fail', error instanceof Error ? error.message : 'unknown');
      return null;
    }
  }

  appendToolOutcomes(
    messages: AgentMessage[],
    providerState: unknown,
    outcomes: ToolOutcome[],
  ): AgentMessage[] {
    const next = [...messages];
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
