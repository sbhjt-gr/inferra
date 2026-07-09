import {
  normSkillUrl,
  parseSkillMd,
  scriptCandidates,
  scriptUrl,
  skillMdUrl,
} from '../SkillMdParser';
import { hasJsRuntime } from '../SkillScriptResolver';
import { hasScriptFiles, pickSkillMd } from '../adapters/SkillZipAdapter';
import { buildSkillBridge } from '../WebViewManager';

describe('skillMdParser', () => {
  it('normalizes folder urls', () => {
    expect(normSkillUrl('https://host/skill/')).toBe('https://host/skill');
    expect(normSkillUrl('https://host/skill/SKILL.md')).toBe('https://host/skill');
    expect(skillMdUrl('https://host/skill/')).toBe('https://host/skill/SKILL.md');
    expect(scriptUrl('https://host/skill', 'index.html')).toBe('https://host/skill/scripts/index.html');
  });

  it('parses nested metadata secrets', () => {
    const md = `---
name: mood-music
description: Play music by mood.
metadata:
  require-secret: true
  require-secret-description: Loudly key
  homepage: https://example.com
---

Call run_js with index.html.`;

    const payload = parseSkillMd(md, 'fallback', { hasScripts: true });
    expect(payload.name).toBe('mood-music');
    expect(payload.type).toBe('js');
    expect(payload.secret?.required).toBe(true);
    expect(payload.secret?.label).toBe('Loudly key');
    expect(payload.metadata?.homepage).toBe('https://example.com');
  });

  it('rejects missing description', () => {
    const md = `---
name: only-name
---

Body`;
    expect(() => parseSkillMd(md, 'fallback')).toThrow('skill_desc_missing');
  });
});

describe('skillScript', () => {
  it('defaults script candidates', () => {
    expect(scriptCandidates()).toEqual(['index.html', 'main', 'main.html']);
    expect(scriptCandidates('get_genres.html')).toEqual(['get_genres.html']);
  });

  it('detects js runtime sources', () => {
    expect(hasJsRuntime({ id: 'a', name: 'A', description: '', type: 'js', instructions: '', source: 'local', enabled: false, baseUrl: 'https://x' })).toBe(true);
    expect(hasJsRuntime({ id: 'b', name: 'B', description: '', type: 'js', instructions: '', source: 'local', enabled: false, packageDir: '/pkg' })).toBe(true);
    expect(hasJsRuntime({ id: 'c', name: 'C', description: '', type: 'js', instructions: '', source: 'local', enabled: false })).toBe(false);
  });
});

describe('skillZip', () => {
  it('requires SKILL.md in zip map', () => {
    expect(pickSkillMd({ 'readme.txt': new Uint8Array([1]) })).toBeNull();
  });

  it('flags script files', () => {
    expect(hasScriptFiles({ 'scripts/index.html': new Uint8Array([1]) })).toBe(true);
    expect(hasScriptFiles({ 'SKILL.md': new Uint8Array([1]) })).toBe(false);
  });
});

describe('skillBridge', () => {
  it('builds dual-entry bridge', () => {
    const bridge = buildSkillBridge('task-1', { data: '{}', secret: '' });
    expect(bridge).toContain('ai_edge_gallery_get_result');
    expect(bridge).toContain('runSkill');
  });
});
