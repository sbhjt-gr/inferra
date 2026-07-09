import type { ProviderType } from './ModelManagementService';
import { agentRuntime } from './agent/AgentRuntime';
import { buildRequestToolCatalog } from './agent/ToolCatalog';
import { toolRegistry } from './tools/ToolRegistry';

export type SkillLoopOpts = {
  settings: any;
  onToken?: (token: string) => boolean | void;
  onToolRound?: () => void;
  shouldCancel?: () => boolean;
};

class SkillToolLoopService {
  async run(
    activeProvider: ProviderType | null,
    messages: any[],
    opts: SkillLoopOpts,
  ): Promise<string | null> {
    if (!activeProvider || !toolRegistry.hasTools()) {
      console.log('agent_loop_no_tools');
      return null;
    }

    const catalog = buildRequestToolCatalog();
    const result = await agentRuntime.run(activeProvider, messages, {
      provider: String(activeProvider),
      settings: {
        temperature: opts.settings.temperature,
        maxTokens: opts.settings.maxTokens,
        topP: opts.settings.topP,
        topK: opts.settings.topK,
        systemPrompt: opts.settings.systemPrompt,
      },
      onToken: opts.onToken,
      onToolRound: opts.onToolRound,
      shouldCancel: opts.shouldCancel,
    }, catalog);

    if (result.status === 'completed') {
      return result.text || null;
    }
    if (result.status === 'cancelled') {
      return null;
    }
    console.log('agent_loop_end', result.status);
    return null;
  }

  async followUpFromResponse(
    _activeProvider: ProviderType | null,
    _messages: any[],
    _initialResponse: string,
    _opts: SkillLoopOpts,
  ): Promise<string | null> {
    // Follow-up parsing of conversational JSON is retired; AgentRuntime owns multi-round loops.
    return null;
  }
}

export const skillToolLoopService = new SkillToolLoopService();
