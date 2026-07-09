import { generateRandomId } from '../utils/homeScreenUtils';
import type { SkillCatalogEntry } from './SkillContextService';
import { buildCompactCatalog } from './SkillContextService';
import { skillActivityAdapter } from './adapters/SkillActivityAdapter';
import { hasJsRuntime } from './SkillScriptResolver';
import { toolExecutor } from './tools/ToolExecutor';
import { toolRegistry, type ToolCall } from './tools/ToolRegistry';
import { formatSearchResponse, type SearchResponse } from './search/SearchProvider';
import { skillManager } from './SkillManager';

export type PlanAction = 'none' | 'use_skill' | 'web_search';

export type SkillPlan = {
  action: PlanAction;
  skillId?: string;
  scriptName?: string;
  data?: string;
  query?: string;
};

type GenFn = (prompt: string) => Promise<string>;

const PLANNER_PROMPT = `Pick one action for the user message.
Always-available tools:
- web_search: Search the web for current information (query required).

Enabled skills:
{{catalog}}

Reply with ONLY one JSON object:
{"action":"none"}
or
{"action":"web_search","query":"<search query>"}
or
{"action":"use_skill","skillId":"<id from list>","scriptName":"index","data":"<json string for skill input>"}

Use web_search for recent facts, news, versions, or source-backed answers.
Use use_skill only when the user wants to run a listed skill now.
Use none for normal chat or capability questions.`;

const formatWebSearchFallback = (toolOut: string, query: string): string => {
  try {
    const parsed = JSON.parse(toolOut) as { result?: string; results?: SearchResponse['results'] };
    if (parsed.result?.trim()) {
      return `Results for "${query}":\n${parsed.result.trim()}`;
    }
    if (Array.isArray(parsed.results) && parsed.results.length > 0) {
      return formatSearchResponse({ query, results: parsed.results });
    }
  } catch {
  }
  return `Results for "${query}":\n${toolOut}`;
};

const toToolCall = (name: string, args: Record<string, unknown>): ToolCall => ({
  id: generateRandomId(),
  type: 'function',
  function: {
    name,
    arguments: JSON.stringify(args),
  },
});

export const parsePlan = (text: string, catalog: SkillCatalogEntry[]): SkillPlan => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { action: 'none' };
  }

  const candidates = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    candidates.unshift(fence[1].trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const action = String(parsed.action || '').trim();
      if (action === 'web_search') {
        const query = String(parsed.query || parsed.q || parsed.data || '').trim();
        if (!query) {
          return { action: 'none' };
        }
        return { action: 'web_search', query };
      }
      if (action === 'use_skill') {
        const skillId = String(parsed.skillId || parsed.skillName || '').trim();
        const valid = catalog.some(skill => skill.id === skillId || skill.name.toLowerCase() === skillId.toLowerCase());
        if (!valid) {
          console.log('skill_plan_invalid', { skillId });
          return { action: 'none' };
        }
        const match = catalog.find(skill => skill.id === skillId || skill.name.toLowerCase() === skillId.toLowerCase());
        return {
          action: 'use_skill',
          skillId: match?.id || skillId,
          scriptName: String(parsed.scriptName || 'index').trim() || 'index',
          data: typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data ?? {}),
        };
      }
      return { action: 'none' };
    } catch {
    }
  }

  return { action: 'none' };
};

class SkillPlannerService {
  async plan(userText: string, catalog: SkillCatalogEntry[], genText: GenFn): Promise<SkillPlan> {
    if (!userText.trim() || !toolRegistry.hasTools()) {
      console.log('skill_plan_skip');
      return { action: 'none' };
    }

    const catalogText = catalog.length > 0
      ? buildCompactCatalog(catalog, 24)
      : '(none)';
    const prompt = PLANNER_PROMPT.replace('{{catalog}}', catalogText)
      + `\n\nUser message: ${userText}\n\nJSON:`;

    console.log('skill_plan_start', { qLen: userText.length, skillCount: catalog.length });
    let raw = '';
    try {
      raw = await genText(prompt);
    } catch (error) {
      console.log('skill_plan_fail', error instanceof Error ? error.message : 'unknown');
      return { action: 'none' };
    }

    const plan = parsePlan(raw, catalog);
    console.log('skill_plan_done', plan);
    return plan;
  }

  async runPlan(
    plan: SkillPlan,
    userText: string,
    genAnswer: (prompt: string, onToken?: (token: string) => boolean | void) => Promise<string>,
    onToken?: (token: string) => boolean | void,
  ): Promise<string | null> {
    if (plan.action === 'web_search') {
      const query = (plan.query || userText).trim();
      if (!query) {
        return null;
      }
      const runId = skillActivityAdapter.start('Calling web_search', query);
      let toolOut = '';
      try {
        const run = await toolExecutor.execute(toToolCall('web_search', { query, maxResults: '6' }));
        toolOut = run.content;
        skillActivityAdapter.done(runId, 'Called web_search');
      } catch (error) {
        skillActivityAdapter.done(runId, 'Failed web_search');
        console.log('web_search_run_fail', error instanceof Error ? error.message : 'unknown');
        return null;
      }

      const answerPrompt = `Answer the user using the web search result below. Be concise and factual. Cite titles and URLs when available.\n\nUser: ${userText}\n\nResult:\n${toolOut}\n\nAnswer:`;
      console.log('web_search_answer_start', { rLen: toolOut.length });
      let text = '';
      try {
        const answer = await genAnswer(answerPrompt, onToken);
        text = (answer || '').trim();
      } catch (error) {
        console.log('web_search_answer_fail', error instanceof Error ? error.message : 'unknown');
      }
      if (!text) {
        const fallback = formatWebSearchFallback(toolOut, query);
        console.log('web_search_answer_fallback', { len: fallback.length });
        onToken?.(fallback);
        return fallback;
      }
      console.log('web_search_answer_done', { len: text.length });
      return text;
    }

    if (plan.action !== 'use_skill' || !plan.skillId) {
      return null;
    }

    const skill = await skillManager.getSkill(plan.skillId);
    if (!skill) {
      console.log('skill_run_miss', plan.skillId);
      return null;
    }

    const loadId = skillActivityAdapter.start(`Loading ${skill.name}`, plan.skillId);
    try {
      await toolExecutor.execute(toToolCall('load_skill', { skillName: skill.name }));
      skillActivityAdapter.done(loadId, `Loaded ${skill.name}`);
    } catch (error) {
      skillActivityAdapter.done(loadId, `Failed ${skill.name}`);
      console.log('skill_run_load_fail', error instanceof Error ? error.message : 'unknown');
      return null;
    }

    const payload = plan.data || JSON.stringify({ query: userText });
    const runId = skillActivityAdapter.start(`Running ${skill.name}`, payload);
    let toolOut = '';
    try {
      if (skill.type === 'js' && hasJsRuntime(skill)) {
        const run = await toolExecutor.execute(toToolCall('run_js', {
          skillName: skill.name,
          scriptName: plan.scriptName || skill.metadata?.scriptName || 'index',
          data: payload,
        }));
        toolOut = run.content;
      } else {
        console.log('skill_run_text_skip', skill.id);
        skillActivityAdapter.done(runId, `Skipped ${skill.name}`);
        return null;
      }
      skillActivityAdapter.done(runId, `Ran ${skill.name}`);
    } catch (error) {
      skillActivityAdapter.done(runId, `Failed ${skill.name}`);
      console.log('skill_run_exec_fail', error instanceof Error ? error.message : 'unknown');
      return null;
    }

    const answerPrompt = `Answer the user using the skill result below. Be concise and factual.\n\nUser: ${userText}\n\nSkill: ${skill.name}\nResult:\n${toolOut}\n\nAnswer:`;
    console.log('skill_answer_start', { skillId: skill.id, rLen: toolOut.length });

    const answer = await genAnswer(answerPrompt, onToken);

    const text = answer.trim();
    if (!text) {
      console.log('skill_answer_empty');
      return null;
    }
    console.log('skill_answer_done', { len: text.length });
    return text;
  }
}

export const skillPlannerService = new SkillPlannerService();
