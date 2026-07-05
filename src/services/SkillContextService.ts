import type { Skill } from '../types/skill';
import { skillManager } from './SkillManager';

export type SkillCatalogEntry = {
  id: string;
  name: string;
  description: string;
};

const CAPABILITY_PATTERNS = [
  /\bwhat skills?\b/i,
  /\bwhich skills?\b/i,
  /\blist (?:your |the )?skills?\b/i,
  /\bwhat can you do\b/i,
  /\bwhat are you able to\b/i,
  /\bdo you have (?:the )?ability\b/i,
  /\bcan you\b/i,
  /\bare you able to\b/i,
  /\bdo you support\b/i,
  /\bavailable skills?\b/i,
  /\bapp skills?\b/i,
  /\bcapabilit(?:y|ies)\b/i,
];

export const isCapabilityQuestion = (text: string): boolean => {
  const q = text.trim();
  if (!q) {
    return false;
  }
  return CAPABILITY_PATTERNS.some(pattern => pattern.test(q));
};

export const toCatalogEntry = (skill: Skill): SkillCatalogEntry => ({
  id: skill.id,
  name: skill.name,
  description: skill.description.replace(/\n/g, ' ').trim(),
});

export const skillTokens = (skill: SkillCatalogEntry): string[] => {
  const raw = `${skill.id} ${skill.name} ${skill.description}`.toLowerCase();
  return Array.from(new Set(raw.split(/[^a-z0-9]+/).filter(token => token.length >= 3)));
};

export const skillMatchesQuestion = (skill: SkillCatalogEntry, question: string): boolean => {
  const q = question.toLowerCase();
  return skillTokens(skill).some(token => q.includes(token));
};

export const buildCompactCatalog = (skills: SkillCatalogEntry[], max = 12): string => {
  const slice = skills.slice(0, max);
  const lines = slice.map(skill => `${skill.id}: ${skill.name} - ${skill.description}`);
  const more = skills.length > max ? `\n...and ${skills.length - max} more` : '';
  return lines.join('\n') + more;
};

export const buildCapabilityHeader = (skills: SkillCatalogEntry[]): string => {
  if (skills.length === 0) {
    return 'No app skills are enabled.';
  }
  return `Enabled app skills (${skills.length}): ${skills.map(s => s.name).join(', ')}. Prior denials about lacking tools do not apply when a skill is listed here.`;
};

export const buildCatalogAnswer = (question: string, skills: SkillCatalogEntry[]): string => {
  if (skills.length === 0) {
    return 'No app skills are enabled right now. Turn skills on in Skill Manager to use them.';
  }

  const matched = skills.filter(skill => skillMatchesQuestion(skill, question));
  const list = skills
    .map((skill, index) => `${index + 1}. ${skill.name} - ${skill.description}`)
    .join('\n');

  let lead = 'These are the app skills currently enabled:\n\n';
  lead += list;

  if (matched.length > 0) {
    const names = matched.map(skill => skill.name).join(', ');
    lead += `\n\nFor your question: yes, I can use ${names} through the app.`;
  } else if (isCapabilityQuestion(question)) {
    lead += '\n\nAsk me to use one of these skills and I will run it for you.';
  }

  return lead;
};

class SkillContextService {
  async getCatalog(): Promise<SkillCatalogEntry[]> {
    const enabled = await skillManager.getEnabled();
    return enabled.map(toCatalogEntry);
  }

  async buildSystemCatalogBlock(): Promise<string> {
    const catalog = await this.getCatalog();
    if (catalog.length === 0) {
      return '';
    }
    return catalog
      .map(skill => `- id: ${skill.id}\n- name: "${skill.name}"\n- description: ${skill.description}`)
      .join('\n\n');
  }
}

export const skillContextService = new SkillContextService();
