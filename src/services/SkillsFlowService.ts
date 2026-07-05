import {
  buildCapabilityHeader,
  buildCatalogAnswer,
  isCapabilityQuestion,
  skillContextService,
  type SkillCatalogEntry,
} from './SkillContextService';
import { skillPlannerService } from './SkillPlannerService';
import { skillManager } from './SkillManager';

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
    const skillsOn = await skillManager.isModeEnabled();
    if (!skillsOn) {
      console.log('skills_flow_off');
      return { handled: false };
    }

    const catalog = await skillContextService.getCatalog();
    if (catalog.length === 0) {
      console.log('skills_flow_empty');
      return { handled: false };
    }

    const skillHeader = buildCapabilityHeader(catalog);
    const userText = opts.userText.trim();
    if (!userText) {
      return { handled: false, skillHeader };
    }

    if (isCapabilityQuestion(userText)) {
      const text = buildCatalogAnswer(userText, catalog);
      console.log('skills_flow_catalog', { len: text.length });
      return { handled: true, text, skillHeader };
    }

    const plan = await skillPlannerService.plan(userText, catalog, prompt => opts.genText(prompt));
    if (plan.action !== 'use_skill') {
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

    console.log('skills_flow_run_done', { len: answer.length });
    return { handled: true, text: answer, skillHeader };
  }
}

export const skillsFlowService = new SkillsFlowService();
