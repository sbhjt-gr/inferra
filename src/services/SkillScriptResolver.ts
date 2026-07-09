import { skillPkgStore } from './adapters/SkillPackageStore';
import { scriptCandidates, scriptUrl } from './SkillMdParser';
import type { Skill } from '../types/skill';

export type ResolvedScript = {
  html?: string;
  uri?: string;
};

const fetchRemote = async (url: string): Promise<string> => {
  console.log('skill_script_fetch', url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('script_fetch_failed');
  }
  const text = await response.text();
  if (!text.trim()) {
    throw new Error('script_empty');
  }
  return text;
};

export const resolveSkillHtml = async (
  skill: Skill,
  scriptName?: string,
): Promise<ResolvedScript> => {
  const names = scriptCandidates(scriptName || skill.metadata?.scriptName);

  if (skill.packageDir) {
    for (const name of names) {
      const html = await skillPkgStore.readScript(skill.id, name);
      if (html) {
        return { uri: skillPkgStore.scriptUri(skill.id, name), html };
      }
    }
    throw new Error('script_missing');
  }

  if (skill.baseUrl) {
    for (const name of names) {
      const cached = await skillPkgStore.readScript(skill.id, name, true);
      if (cached) {
        return { uri: skillPkgStore.scriptUri(skill.id, name, true), html: cached };
      }
      try {
        const remote = await fetchRemote(scriptUrl(skill.baseUrl, name));
        const uri = await skillPkgStore.cacheRemoteScript(skill.id, name, remote);
        return { uri, html: remote };
      } catch {
      }
    }
    throw new Error('script_missing');
  }

  if (skill.scriptHtml?.trim()) {
    return { html: skill.scriptHtml.trim() };
  }

  throw new Error('script_missing');
};

export const hasJsRuntime = (skill: Skill): boolean => {
  return !!skill.scriptHtml?.trim() || !!skill.packageDir || !!skill.baseUrl;
};
