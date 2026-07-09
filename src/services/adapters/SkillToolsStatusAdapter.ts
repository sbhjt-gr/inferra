import type { Skill } from '../../types/skill';
import { hasJsRuntime } from '../SkillScriptResolver';
import { skillManager } from '../SkillManager';
import { toolRegistry } from '../tools/ToolRegistry';

const MOBILE_INTENTS = new Set([
  'call_phone',
  'create_calendar_event',
  'create_contact',
  'get_current_date_and_time',
  'open_map',
  'open_settings',
  'open_url',
  'read_calendar_events',
  'schedule_notification',
  'send_email',
  'send_sms',
]);

const SKILL_TOOL_MAP: Record<string, string[]> = {
  'calculate-hash': ['run_js'],
  'create-calendar-event': ['run_intent'],
  'encode-tool': ['run_js'],
  'interactive-map': ['run_js'],
  'json-toolkit': ['run_js'],
  'learn-something-new': ['run_js', 'run_intent'],
  'mood-tracker': ['run_js'],
  'qr-code': ['run_js'],
  'query-wikipedia': ['run_js'],
  'quick-call': ['run_intent'],
  'quick-sms': ['run_intent'],
  'read-calendar-events': ['run_intent'],
  'route-planner': ['run_intent'],
  'schedule-notification': ['run_intent'],
  'send-email': ['run_intent'],
  'text-stats': ['run_js'],
  'text-spinner': ['run_js'],
  'tip-split': ['run_js'],
  'unit-convert': ['run_js'],
  'web-search': ['run_js'],
  'virtual-piano': ['run_js'],
  'restaurant-roulette': ['run_js'],
  'mood-music': ['run_js'],
};

const TOOL_LABELS: Record<string, string> = {
  run_js: 'run_js',
  run_intent: 'run_intent',
  script: 'skill script',
  api_secret: 'API key',
};

const inferNeeds = (skill: Skill): string[] => {
  if (skill.type === 'js') {
    return ['run_js'];
  }
  if (skill.instructions.includes('run_intent')) {
    return ['run_intent'];
  }
  return [];
};

const isToolReady = (tool: string, skillsModeOn: boolean): boolean => {
  if (!skillsModeOn) {
    return false;
  }
  if (MOBILE_INTENTS.has(tool)) {
    return !!toolRegistry.getSchema('run_intent');
  }
  return !!toolRegistry.getSchema(tool) || toolRegistry.isBuiltin(tool);
};

export const formatMissingTools = (missing: string[]): string => {
  if (missing.length === 0) {
    return '';
  }
  const labels = missing.map(entry => TOOL_LABELS[entry] || entry);
  return `Tools missing: ${labels.join(', ')}`;
};

export const getSkillMissingTools = async (
  skill: Skill,
  skillsModeOn: boolean,
): Promise<string[]> => {
  const missing: string[] = [];
  const needs = SKILL_TOOL_MAP[skill.id] || inferNeeds(skill);

  if (skill.type === 'js' && !hasJsRuntime(skill)) {
    missing.push('script');
  }

  for (const tool of needs) {
    if (!isToolReady(tool, skillsModeOn)) {
      missing.push(tool);
    }
  }

  if (skill.secret?.required) {
    const secret = await skillManager.getSecret(skill.id);
    if (!secret?.trim()) {
      missing.push('api_secret');
    }
  }

  console.log('skill_tool_gap', skill.id, missing.join(',') || 'none');
  return [...new Set(missing)];
};

export const listSkillsWithMissingTools = async (
  skills: Skill[],
  skillsModeOn: boolean,
): Promise<Array<{ skill: Skill; missing: string[] }>> => {
  const rows = await Promise.all(
    skills.map(async skill => ({
      skill,
      missing: await getSkillMissingTools(skill, skillsModeOn),
    })),
  );
  return rows.filter(row => row.missing.length > 0);
};
