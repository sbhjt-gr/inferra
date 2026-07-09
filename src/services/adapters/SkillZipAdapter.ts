import { unzipSync } from 'fflate';

import { fs } from '../fs';

export type ZipMap = Record<string, Uint8Array>;

const normPath = (path: string): string => {
  let value = path.replace(/\\/g, '/');
  while (value.startsWith('./')) {
    value = value.slice(2);
  }
  if (value.startsWith('/')) {
    value = value.slice(1);
  }
  return value;
};

const decodeText = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

export const readZipFile = async (uri: string): Promise<ZipMap> => {
  const base64 = await fs.readAsStringAsync(uri, { encoding: fs.EncodingType.Base64 });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const raw = unzipSync(bytes) as ZipMap;
  const out: ZipMap = {};
  for (const [key, value] of Object.entries(raw)) {
    out[normPath(key)] = value;
  }
  console.log('zip_read', Object.keys(out).length);
  return out;
};

export const pickSkillMd = (files: ZipMap): string | null => {
  const direct = files['SKILL.md'];
  if (direct) {
    return decodeText(direct);
  }
  const nested = Object.entries(files).find(([path]) => path.endsWith('/SKILL.md'));
  if (!nested) {
    return null;
  }
  return decodeText(nested[1]);
};

export const hasScriptFiles = (files: ZipMap): boolean => {
  return Object.keys(files).some(path => path.includes('scripts/') && path.endsWith('.html'));
};

export const toPkgFiles = (files: ZipMap): Record<string, string | Uint8Array> => {
  const skillEntry = Object.entries(files).find(([path]) => path === 'SKILL.md' || path.endsWith('/SKILL.md'));
  if (!skillEntry) {
    throw new Error('skill_md_missing');
  }

  const prefix = skillEntry[0] === 'SKILL.md' ? '' : skillEntry[0].slice(0, -'SKILL.md'.length);
  const out: Record<string, string | Uint8Array> = {
    'SKILL.md': decodeText(skillEntry[1]),
  };

  for (const [path, bytes] of Object.entries(files)) {
    if (!path.startsWith(prefix) || path === skillEntry[0]) {
      continue;
    }
    const rel = path.slice(prefix.length);
    if (rel.startsWith('scripts/') || rel.startsWith('assets/')) {
      if (rel.endsWith('.html') || rel.endsWith('.md') || rel.endsWith('.js') || rel.endsWith('.css')) {
        out[rel] = decodeText(bytes);
      } else {
        out[rel] = bytes;
      }
    }
  }

  console.log('zip_pkg', Object.keys(out).length);
  return out;
};
