import type { Skill } from '../types/skill';
import { skillManager } from './SkillManager';

export type SkillCatalogEntry = {
  id: string;
  name: string;
  description: string;
};

export const toCatalogEntry = (skill: Skill): SkillCatalogEntry => ({
  id: skill.id,
  name: skill.name,
  description: skill.description.replace(/\n/g, ' ').trim(),
});

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
  return `Enabled app skills (${skills.length}): ${skills.map(s => s.name).join(', ')}.`;
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
