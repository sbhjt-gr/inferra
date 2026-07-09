import {
  buildCapabilityHeader,
  skillContextService,
} from './SkillContextService';
import { skillPlannerService } from './SkillPlannerService';
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
  skillHeader?: string;
};

class SkillsFlowService {
  async run(opts: SkillsFlowOpts): Promise<SkillsFlowResult> {
    registerWebSearch();

    const skillsOn = await skillManager.isModeEnabled();
    const catalog = skillsOn ? await skillContextService.getCatalog() : [];
    const skillHeaderParts = [
      'Always-available tool: web_search.',
      catalog.length > 0 ? buildCapabilityHeader(catalog) : '',
    ].filter(Boolean);
    const skillHeader = skillHeaderParts.join(' ');

    if (!toolRegistry.hasTools()) {
      console.log('skills_flow_no_tools');
      return { handled: false, skillHeader };
    }

    const userText = opts.userText.trim();
    if (!userText) {
      return { handled: false, skillHeader };
    }

    console.log('skills_flow_plan_reuse');
    const plan = await skillPlannerService.plan(
      userText,
      catalog,
      prompt => opts.genText(prompt, { reuseSession: true }),
    );
    if (plan.action === 'none') {
      console.log('skills_flow_chat');
      return { handled: false, skillHeader };
    }

    const answer = await skillPlannerService.runPlan(
      plan,
      userText,
      (prompt, onToken) => opts.genText(prompt, { reuseSession: true, onToken: onToken || opts.onToken }),
    );

    if (!answer) {
      console.log('skills_flow_run_miss');
      return { handled: false, skillHeader };
    }

    console.log('skills_flow_run_done', { action: plan.action, len: answer.length });
    return { handled: true, text: answer, skillHeader };
  }
}

export const skillsFlowService = new SkillsFlowService();
