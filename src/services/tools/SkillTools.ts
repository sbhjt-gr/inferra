import { skillExecutor } from '../SkillExecutor';
import { skillManager } from '../SkillManager';
import { skillActivityAdapter } from '../adapters/SkillActivityAdapter';
import { toolRegistry, type ToolSchema } from './ToolRegistry';

const SKILL_TOOL_NAMES = ['list_skills', 'load_skill', 'run_skill', 'run_js', 'run_intent'] as const;

const trimDetail = (value: unknown, max = 180): string | undefined => {
  if (value == null) {
    return undefined;
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) {
    return undefined;
  }
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

const LOAD_SKILL_TOOL: ToolSchema = {
  type: 'function',
  function: {
    name: 'load_skill',
    description: 'Load a skill by name or id and return its instructions.',
    parameters: {
      type: 'object',
      properties: {
        skillName: {
          type: 'string',
          description: 'The skill id or display name to load.',
        },
      },
      required: ['skillName'],
    },
  },
};

const RUN_JS_TOOL: ToolSchema = {
  type: 'function',
  function: {
    name: 'run_js',
    description: 'Run a JavaScript skill against an input payload.',
    parameters: {
      type: 'object',
      properties: {
        skillName: {
          type: 'string',
          description: 'The skill id or display name to run.',
        },
        scriptName: {
          type: 'string',
          description: 'The script entry point to run inside the skill.',
        },
        data: {
          type: 'string',
          description: 'The raw input for the skill.',
        },
      },
      required: ['skillName'],
    },
  },
};

const RUN_INTENT_TOOL: ToolSchema = {
  type: 'function',
  function: {
    name: 'run_intent',
    description: 'Execute a device action intent such as schedule_notification, get_current_date_and_time, read_calendar_events, create_calendar_event, send_email, or open_map.',
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'The native intent name, such as open_map or send_email.',
        },
        parameters: {
          type: 'object',
          description: 'A JSON object of parameters for the intent.',
          additionalProperties: true,
        },
      },
      required: ['intent'],
    },
  },
};

const resolveSkill = async (name: string) => {
  const skills = await skillManager.getEnabled();
  return skills.find(skill => skill.id === name || skill.name.toLowerCase() === name.toLowerCase()) || null;
};

const OWNER = 'skill_tools';

export const unregisterSkillTools = () => {
  toolRegistry.unregisterByOwner(OWNER);
};

export const registerSkillTools = async () => {
  unregisterSkillTools();

  const enabled = await skillManager.getEnabled();
  console.log('skill_tools_register', { count: enabled.length });
  if (enabled.length === 0) {
    return;
  }

  toolRegistry.register(
    'load_skill',
    LOAD_SKILL_TOOL,
    async ({ skillName }) => {
      const name = String(skillName || '').trim();
      console.log('skill_tool_load', name);
      const stepId = skillActivityAdapter.start(`Loading skill "${name}"`);
      try {
        const match = await resolveSkill(name);
        if (!match) {
          throw new Error('skill_not_found');
        }
        skillActivityAdapter.done(stepId, `Loaded skill "${match.name}"`);
        return match.instructions;
      } catch (error) {
        skillActivityAdapter.done(stepId, `Failed to load skill "${name || 'unknown'}"`);
        throw error;
      }
    },
    { ownerId: OWNER, source: 'skill', risk: 'read' },
  );

  toolRegistry.register(
    'run_js',
    RUN_JS_TOOL,
    async ({ skillName, scriptName, data }) => {
      const name = String(skillName || '').trim();
      const script = String(scriptName || 'main');
      console.log('skill_tool_js', { name, script });
      const stepId = skillActivityAdapter.start(`Calling skill "${name}"`);
      try {
        const match = await resolveSkill(name);
        if (!match) {
          skillActivityAdapter.done(stepId, `Skill not found: ${name}`);
          throw new Error('skill_not_found');
        }
        const result = await skillExecutor.runJs(match, {
          scriptName: String(scriptName || match.metadata?.scriptName || 'main'),
          data: data || '',
        });
        const failed = !!result.error;
        skillActivityAdapter.done(
          stepId,
          failed ? `Skill "${match.name}" failed` : `Called skill "${match.name}"`,
        );
        return JSON.stringify(result);
      } catch (error) {
        skillActivityAdapter.done(stepId, `Failed to run skill "${name}"`);
        throw error;
      }
    },
    { ownerId: OWNER, source: 'skill', risk: 'write' },
  );

  toolRegistry.register(
    'run_intent',
    RUN_INTENT_TOOL,
    async ({ intent, parameters }) => {
      const intentName = String(intent || '').trim();
      console.log('skill_tool_intent', intentName);
      const stepId = skillActivityAdapter.start(`Calling intent "${intentName}"`);
      try {
        const result = await skillExecutor.runIntent(
          intentName,
          parameters && typeof parameters === 'object' && !Array.isArray(parameters)
            ? parameters as Record<string, any>
            : {},
        );
        skillActivityAdapter.done(stepId, `Called intent "${intentName}"`);
        return JSON.stringify(result);
      } catch (error) {
        skillActivityAdapter.done(stepId, `Failed intent "${intentName}"`);
        throw error;
      }
    },
    { ownerId: OWNER, source: 'skill', risk: 'write' },
  );
};
