/** @deprecated Legacy entry point; chat routes through AgentRuntime directly. */
import { agentRuntime } from './agent/AgentRuntime';
import { buildRequestToolCatalog } from './agent/ToolCatalog';
import { skillContextService } from './SkillContextService';
import { skillManager } from './SkillManager';
import { toolRegistry } from './tools/ToolRegistry';
import { registerWebSearch } from './tools/WebSearchTool';

export type SkillsFlowOpts = {
  userText: string;
  settings: any;
  onToken?: (token: string) => boolean | void;
  genText: (prompt: string, extra?: { reuseSession?: boolean; onToken?: (token: string) => boolean | void }) => Promise<string>;
};

export type SkillsFlowResult = {
  handled: boolean;
  text?: string;
};

class SkillsFlowService {
  async run(opts: SkillsFlowOpts): Promise<SkillsFlowResult> {
    registerWebSearch();

    if (!toolRegistry.hasTools()) {
      console.log('skills_flow_no_tools');
      return { handled: false };
    }

    const userText = opts.userText.trim();
    if (!userText) {
      return { handled: false };
    }

    const skillsOn = await skillManager.isModeEnabled();
    if (!skillsOn) {
      return { handled: false };
    }

    const catalog = await skillContextService.getCatalog();
    if (catalog.length === 0 && !toolRegistry.getSchema('web_search')) {
      return { handled: false };
    }

    const messages = [
      ...(opts.settings.systemPrompt
        ? [{ role: 'system', content: opts.settings.systemPrompt }]
        : []),
      { role: 'user', content: userText },
    ];

    const result = await agentRuntime.run('local', messages, {
      provider: 'local',
      settings: {
        temperature: opts.settings.temperature,
        maxTokens: opts.settings.maxTokens,
        topP: opts.settings.topP,
        systemPrompt: opts.settings.systemPrompt,
      },
      onToken: opts.onToken,
    }, buildRequestToolCatalog());

    if (result.status === 'completed' && result.text) {
      console.log('skills_flow_agent_done', { len: result.text.length });
      return { handled: true, text: result.text };
    }

    console.log('skills_flow_chat');
    return { handled: false };
  }
}

export const skillsFlowService = new SkillsFlowService();
