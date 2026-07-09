import type { SkillImportPayload, SkillType } from '../../types/skill';

export type ParseOpts = {
  hasScripts?: boolean;
};

export const normSkillUrl = (url: string): string => {
  let value = url.trim();
  if (value.endsWith('/SKILL.md')) {
    value = value.slice(0, -'/SKILL.md'.length);
  }
  while (value.endsWith('/')) {
    value = value.slice(0, -1);
  }
  return value;
};

export const skillMdUrl = (baseUrl: string): string => `${normSkillUrl(baseUrl)}/SKILL.md`;

export const scriptUrl = (baseUrl: string, scriptName: string): string => {
  const base = normSkillUrl(baseUrl);
  const name = scriptName.trim() || 'index.html';
  return `${base}/scripts/${name}`;
};

export const scriptCandidates = (scriptName?: string): string[] => {
  const raw = scriptName?.trim() || 'index.html';
  if (raw === 'index.html' || raw === 'main') {
    return ['index.html', 'main', 'main.html'];
  }
  return [raw];
};

const parseFrontMatter = (content: string): { body: string; meta: Record<string, string> } => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { body: content.trim(), meta: {} };
  }

  const meta: Record<string, string> = {};
  let inMeta = false;

  for (const line of match[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed === 'metadata:') {
      inMeta = true;
      continue;
    }
    const sep = trimmed.indexOf(':');
    if (sep === -1) {
      continue;
    }
    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim();
    if (inMeta) {
      meta[key] = value;
    } else {
      meta[key] = value;
    }
  }

  return { body: match[2].trim(), meta };
};

const inferType = (meta: Record<string, string>, body: string, opts?: ParseOpts): SkillType => {
  if (meta.type?.trim() === 'js') {
    return 'js';
  }
  if (opts?.hasScripts) {
    return 'js';
  }
  if (body.includes('run_js')) {
    return 'js';
  }
  return 'text';
};

export const parseSkillMd = (
  content: string,
  fallbackName: string,
  opts?: ParseOpts,
): SkillImportPayload => {
  try {
    const parsed = JSON.parse(content) as SkillImportPayload;
    if (parsed?.name && parsed.instructions) {
      return parsed;
    }
  } catch {
  }

  const { body, meta } = parseFrontMatter(content);
  const name = meta.name?.trim() || fallbackName;
  const description = meta.description?.trim() || '';

  if (!name) {
    throw new Error('skill_name_missing');
  }
  if (!description) {
    throw new Error('skill_desc_missing');
  }

  const secretLabel = meta.secretLabel?.trim()
    || meta['require-secret-description']?.trim();
  const secretRequired = meta.secretRequired?.toLowerCase() === 'true'
    || meta['require-secret']?.toLowerCase() === 'true';

  return {
    name,
    description,
    instructions: body || content.trim(),
    type: inferType(meta, body, opts),
    metadata: {
      homepage: meta.homepage?.trim() || undefined,
      requireSecret: secretRequired,
      scriptName: meta.scriptName?.trim() || undefined,
    },
    secret: secretLabel || secretRequired
      ? { label: secretLabel || 'Secret', required: secretRequired }
      : undefined,
    handler: meta.handler?.trim() || undefined,
  };
};
