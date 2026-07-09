import { executeMobileActionIntent } from './tools/MobileActionsTools';
import { backgroundWebViewManager } from './WebViewManager';
import { hasJsRuntime, resolveSkillHtml } from './SkillScriptResolver';
import { skillManager } from './SkillManager';
import type { Skill, SkillResult } from '../types/skill';

type SkillArgs = Record<string, any>;

class SkillExecutor {
  private formatInput(args: SkillArgs): string {
    return Object.keys(args).length > 0 ? JSON.stringify(args, null, 2) : 'No input provided.';
  }

  private toDataString(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }
    if (data == null) {
      return '{}';
    }
    return JSON.stringify(data);
  }

  async run(skill: Skill, args: SkillArgs): Promise<SkillResult> {
    if (skill.type === 'text' || !hasJsRuntime(skill)) {
      return {
        result: `${skill.instructions}\n\nInput:\n${this.formatInput(args)}`,
      };
    }

    return this.runJs(skill, {
      scriptName: skill.metadata?.scriptName,
      data: args.input ?? args.data ?? args,
    });
  }

  async runJs(skill: Skill, args: { scriptName?: string; data?: unknown }): Promise<SkillResult> {
    if (skill.type !== 'js' || !hasJsRuntime(skill)) {
      throw new Error('skill_not_js');
    }

    const script = args.scriptName || skill.metadata?.scriptName || 'index.html';
    console.log('skill_js_start', { id: skill.id, script });
    const resolved = await resolveSkillHtml(skill, script);
    const secret = await skillManager.getSecret(skill.id);
    const out = await backgroundWebViewManager.runSkill({
      html: resolved.html,
      uri: resolved.uri,
      input: {
        data: this.toDataString(args.data ?? '{}'),
        secret: secret || '',
      },
    });
    console.log('skill_js_done', { id: skill.id, hasError: !!out.error });
    return out;
  }

  async runIntent(intent: string, parameters: Record<string, any>): Promise<SkillResult> {
    const result = await executeMobileActionIntent(intent, parameters);
    return {
      result,
    };
  }
}

export const skillExecutor = new SkillExecutor();
