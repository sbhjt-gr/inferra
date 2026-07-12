import { Asset } from 'expo-asset';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';

import { skillPkgStore } from './adapters/SkillPackageStore';
import { hasScriptFiles, pickSkillMd, readZipFile, toPkgFiles } from './adapters/SkillZipAdapter';
import { fs as FileSystem } from './fs';
import { normSkillUrl, parseSkillMd, skillMdUrl } from './SkillMdParser';
import type { Skill, SkillImportPayload } from '../types/skill';
import {
  AGENT_SKILLS_PLACEHOLDER,
  AGENT_SKILLS_SYSTEM_PROMPT,
  isAgentSkillsPrompt,
} from '../constants/agentSkillsPrompt';
import { registerSkillTools, unregisterSkillTools } from './tools/SkillTools';

const CUSTOM_SKILLS_KEY = '@skills_custom_v1';
const ENABLED_SKILLS_KEY = '@skills_enabled_v1';
const SKILLS_MODE_KEY = '@skills_mode_enabled_v1';
const SECRET_PREFIX = 'skill_secret_';

type BuiltinSkillAsset = {
  id: string;
  markdown: number;
  html?: number;
};

const BUILTIN_SKILL_ASSETS: BuiltinSkillAsset[] = [
  {
    id: 'app-recovery',
    markdown: require('../../assets/skills/app-recovery/SKILL.md'),
  },
  {
    id: 'calculate-hash',
    markdown: require('../../assets/skills/calculate-hash/SKILL.md'),
    html: require('../../assets/skills/calculate-hash/scripts/index.html'),
  },
  {
    id: 'create-calendar-event',
    markdown: require('../../assets/skills/create-calendar-event/SKILL.md'),
  },
  {
    id: 'cross-app-assistant',
    markdown: require('../../assets/skills/cross-app-assistant/SKILL.md'),
  },
  {
    id: 'device-doctor',
    markdown: require('../../assets/skills/device-doctor/SKILL.md'),
  },
  {
    id: 'encode-tool',
    markdown: require('../../assets/skills/encode-tool/SKILL.md'),
    html: require('../../assets/skills/encode-tool/scripts/index.html'),
  },
  {
    id: 'file-maintenance',
    markdown: require('../../assets/skills/file-maintenance/SKILL.md'),
  },
  {
    id: 'interactive-map',
    markdown: require('../../assets/skills/interactive-map/SKILL.md'),
    html: require('../../assets/skills/interactive-map/scripts/index.html'),
  },
  {
    id: 'json-toolkit',
    markdown: require('../../assets/skills/json-toolkit/SKILL.md'),
    html: require('../../assets/skills/json-toolkit/scripts/index.html'),
  },
  {
    id: 'kitchen-adventure',
    markdown: require('../../assets/skills/kitchen-adventure/SKILL.md'),
  },
  {
    id: 'learn-something-new',
    markdown: require('../../assets/skills/learn-something-new/SKILL.md'),
    html: require('../../assets/skills/learn-something-new/scripts/index.html'),
  },
  {
    id: 'mood-tracker',
    markdown: require('../../assets/skills/mood-tracker/SKILL.md'),
    html: require('../../assets/skills/mood-tracker/scripts/index.html'),
  },
  {
    id: 'package-maintenance',
    markdown: require('../../assets/skills/package-maintenance/SKILL.md'),
  },
  {
    id: 'qr-code',
    markdown: require('../../assets/skills/qr-code/SKILL.md'),
    html: require('../../assets/skills/qr-code/scripts/index.html'),
  },
  {
    id: 'query-wikipedia',
    markdown: require('../../assets/skills/query-wikipedia/SKILL.md'),
    html: require('../../assets/skills/query-wikipedia/scripts/index.html'),
  },
  {
    id: 'quick-call',
    markdown: require('../../assets/skills/quick-call/SKILL.md'),
  },
  {
    id: 'quick-sms',
    markdown: require('../../assets/skills/quick-sms/SKILL.md'),
  },
  {
    id: 'read-calendar-events',
    markdown: require('../../assets/skills/read-calendar-events/SKILL.md'),
  },
  {
    id: 'route-planner',
    markdown: require('../../assets/skills/route-planner/SKILL.md'),
  },
  {
    id: 'schedule-notification',
    markdown: require('../../assets/skills/schedule-notification/SKILL.md'),
  },
  {
    id: 'send-email',
    markdown: require('../../assets/skills/send-email/SKILL.md'),
  },
  {
    id: 'settings-profile',
    markdown: require('../../assets/skills/settings-profile/SKILL.md'),
  },
  {
    id: 'text-stats',
    markdown: require('../../assets/skills/text-stats/SKILL.md'),
    html: require('../../assets/skills/text-stats/scripts/index.html'),
  },
  {
    id: 'text-spinner',
    markdown: require('../../assets/skills/text-spinner/SKILL.md'),
    html: require('../../assets/skills/text-spinner/scripts/index.html'),
  },
  {
    id: 'tip-split',
    markdown: require('../../assets/skills/tip-split/SKILL.md'),
    html: require('../../assets/skills/tip-split/scripts/index.html'),
  },
  {
    id: 'unit-convert',
    markdown: require('../../assets/skills/unit-convert/SKILL.md'),
    html: require('../../assets/skills/unit-convert/scripts/index.html'),
  },
  {
    id: 'virtual-piano',
    markdown: require('../../assets/skills/virtual-piano/SKILL.md'),
    html: require('../../assets/skills/virtual-piano/scripts/index.html'),
  },
  {
    id: 'restaurant-roulette',
    markdown: require('../../assets/skills/restaurant-roulette/SKILL.md'),
    html: require('../../assets/skills/restaurant-roulette/scripts/index.html'),
  },
  {
    id: 'mood-music',
    markdown: require('../../assets/skills/mood-music/SKILL.md'),
    html: require('../../assets/skills/mood-music/scripts/index.html'),
  },
];

class SkillManager {
  private builtinsCache: Skill[] | null = null;

  private async getCustomSkills(): Promise<Skill[]> {
    try {
      const raw = await AsyncStorage.getItem(CUSTOM_SKILLS_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as Skill[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private stripForStorage(skill: Skill): Skill {
    if (skill.packageDir || skill.baseUrl) {
      const { scriptHtml, ...rest } = skill;
      return rest;
    }
    return skill;
  }

  private async saveCustomSkills(skills: Skill[]): Promise<void> {
    const lean = skills.map(skill => this.stripForStorage(skill));
    await AsyncStorage.setItem(CUSTOM_SKILLS_KEY, JSON.stringify(lean));
  }

  private async getEnabledMap(): Promise<Record<string, boolean>> {
    try {
      const raw = await AsyncStorage.getItem(ENABLED_SKILLS_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private async saveEnabledMap(enabled: Record<string, boolean>): Promise<void> {
    await AsyncStorage.setItem(ENABLED_SKILLS_KEY, JSON.stringify(enabled));
  }

  private normalizeImportedSkill(
    payload: SkillImportPayload,
    source: Skill['source'],
    opts?: {
      sourceUrl?: string;
      baseUrl?: string;
      packageDir?: string;
      stableId?: string;
    },
  ): Skill {
    const nameSlug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return {
      id: opts?.stableId || `${nameSlug}-${Date.now()}`,
      name: payload.name.trim(),
      description: payload.description?.trim() || 'Imported custom skill',
      type: payload.type === 'js' ? 'js' : 'text',
      instructions: payload.instructions.trim(),
      scriptHtml: payload.scriptHtml?.trim() || undefined,
      baseUrl: opts?.baseUrl,
      packageDir: opts?.packageDir,
      source,
      sourceUrl: opts?.sourceUrl,
      enabled: false,
      metadata: payload.metadata,
      secret: payload.secret,
      handler: payload.handler,
    };
  }

  private async assertNameFree(name: string): Promise<void> {
    const skills = await this.getAll();
    const hit = skills.find(skill => skill.name.toLowerCase() === name.toLowerCase());
    if (hit) {
      throw new Error('skill_name_exists');
    }
  }

  private async readAssetText(moduleId: number): Promise<string> {
    const [asset] = await Asset.loadAsync(moduleId);
    const assetUri = asset.localUri || asset.uri;
    return FileSystem.readAsStringAsync(assetUri);
  }

  private async addCustomSkill(skill: Skill): Promise<Skill> {
    const customSkills = await this.getCustomSkills();
    customSkills.unshift(skill);
    await this.saveCustomSkills(customSkills);

    const enabledMap = await this.getEnabledMap();
    enabledMap[skill.id] = false;
    await this.saveEnabledMap(enabledMap);
    await this.syncTools();
    return skill;
  }

  async loadBuiltins(): Promise<Skill[]> {
    if (this.builtinsCache) {
      return this.builtinsCache;
    }

    const skills = await Promise.all(
      BUILTIN_SKILL_ASSETS.map(async asset => {
        const [markdown, html] = await Promise.all([
          this.readAssetText(asset.markdown),
          asset.html ? this.readAssetText(asset.html) : Promise.resolve(undefined),
        ]);

        const payload = parseSkillMd(markdown, asset.id, { hasScripts: !!html });
        return this.normalizeImportedSkill(
          {
            ...payload,
            scriptHtml: html || payload.scriptHtml,
          },
          'builtin',
          { stableId: asset.id },
        );
      }),
    );

    this.builtinsCache = skills;
    return skills;
  }

  async getAll(): Promise<Skill[]> {
    const [builtinSkills, customSkills, enabledMap] = await Promise.all([
      this.loadBuiltins(),
      this.getCustomSkills(),
      this.getEnabledMap(),
    ]);

    const builtins = builtinSkills.map(skill => ({
      ...skill,
      enabled: enabledMap[skill.id] === true,
    }));

    const custom = customSkills.map(skill => ({
      ...skill,
      enabled: enabledMap[skill.id] === true,
    }));

    return [...builtins, ...custom];
  }

  async getEnabled(): Promise<Skill[]> {
    const skills = await this.getAll();
    return skills.filter(skill => skill.enabled);
  }

  async getSkill(id: string): Promise<Skill | null> {
    const skills = await this.getAll();
    return skills.find(skill => skill.id === id) || null;
  }

  async toggle(id: string): Promise<void> {
    const skills = await this.getAll();
    const target = skills.find(skill => skill.id === id);
    if (!target) {
      throw new Error('skill_not_found');
    }

    const enabledMap = await this.getEnabledMap();
    enabledMap[id] = !target.enabled;
    await this.saveEnabledMap(enabledMap);
    await this.syncTools();
  }

  async setAllEnabled(enabled: boolean): Promise<void> {
    const skills = await this.getAll();
    const enabledMap = await this.getEnabledMap();
    for (const skill of skills) {
      enabledMap[skill.id] = enabled;
    }
    await this.saveEnabledMap(enabledMap);
    await this.syncTools();
  }

  async remove(id: string): Promise<void> {
    const skills = await this.getCustomSkills();
    const target = skills.find(skill => skill.id === id);
    const next = skills.filter(skill => skill.id !== id);
    await this.saveCustomSkills(next);

    if (target?.packageDir || target?.baseUrl) {
      await skillPkgStore.removePackage(id);
    }

    const enabledMap = await this.getEnabledMap();
    delete enabledMap[id];
    await this.saveEnabledMap(enabledMap);
    await SecureStore.deleteItemAsync(`${SECRET_PREFIX}${id}`);
    await this.syncTools();
  }

  async removeMany(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const idSet = new Set(ids);
    const skills = await this.getCustomSkills();
    for (const skill of skills) {
      if (idSet.has(skill.id) && (skill.packageDir || skill.baseUrl)) {
        await skillPkgStore.removePackage(skill.id);
      }
    }
    await this.saveCustomSkills(skills.filter(skill => !idSet.has(skill.id)));

    const enabledMap = await this.getEnabledMap();
    for (const id of ids) {
      delete enabledMap[id];
      await SecureStore.deleteItemAsync(`${SECRET_PREFIX}${id}`);
    }
    await this.saveEnabledMap(enabledMap);
    await this.syncTools();
  }

  async importFromUrl(url: string): Promise<Skill> {
    const baseUrl = normSkillUrl(url);
    const mdUrl = skillMdUrl(baseUrl);
    console.log('skill_url_import', mdUrl);

    const response = await fetch(mdUrl);
    if (!response.ok) {
      throw new Error('skill_import_failed');
    }

    const text = await response.text();
    const fallbackName = baseUrl.split('/').pop() || 'Imported Skill';
    const payload = parseSkillMd(text, fallbackName);
    await this.assertNameFree(payload.name);

    const skill = this.normalizeImportedSkill(payload, 'url', {
      baseUrl,
      sourceUrl: baseUrl,
    });

    return this.addCustomSkill(skill);
  }

  async importFromFile(): Promise<Skill | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain', 'text/markdown', 'text/x-markdown'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    const asset = result.assets[0];
    const text = await FileSystem.readAsStringAsync(asset.uri);
    const fallbackName = asset.name?.replace(/\.[^.]+$/, '') || 'Imported Skill';
    const payload = parseSkillMd(text, fallbackName);
    await this.assertNameFree(payload.name);

    const skill = this.normalizeImportedSkill(payload, 'local');
    return this.addCustomSkill(skill);
  }

  async importFromZip(): Promise<Skill | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    const asset = result.assets[0];
    const zipMap = await readZipFile(asset.uri);
    const md = pickSkillMd(zipMap);
    if (!md) {
      throw new Error('skill_md_missing');
    }

    const fallbackName = asset.name?.replace(/\.zip$/i, '') || 'Imported Skill';
    const payload = parseSkillMd(md, fallbackName, { hasScripts: hasScriptFiles(zipMap) });
    await this.assertNameFree(payload.name);

    const skill = this.normalizeImportedSkill(payload, 'local');
    const pkgFiles = toPkgFiles(zipMap);
    const packageDir = await skillPkgStore.writePackage(skill.id, pkgFiles);
    skill.packageDir = packageDir;

    return this.addCustomSkill(skill);
  }

  async setSecret(skillId: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(`${SECRET_PREFIX}${skillId}`, value);
  }

  async getSecret(skillId: string): Promise<string | null> {
    return SecureStore.getItemAsync(`${SECRET_PREFIX}${skillId}`);
  }

  async isModeEnabled(): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(SKILLS_MODE_KEY);
      if (raw === null) {
        return true;
      }
      return raw === 'true';
    } catch {
      return true;
    }
  }

  async setModeEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(SKILLS_MODE_KEY, enabled ? 'true' : 'false');
    if (enabled) {
      await registerSkillTools();
      return;
    }
    unregisterSkillTools();
  }

  async buildSystemPrompt(basePrompt?: string): Promise<string> {
    if (!(await this.isModeEnabled())) {
      return basePrompt?.trim() || '';
    }

    const enabled = await this.getEnabled();
    if (enabled.length === 0) {
      return basePrompt?.trim() || '';
    }

    const skillList = enabled
      .map(skill => `- id: ${skill.id}\n- name: "${skill.name}"\n- description: ${skill.description}`)
      .join('\n\n');

    let skillsPrompt = AGENT_SKILLS_SYSTEM_PROMPT.replace(AGENT_SKILLS_PLACEHOLDER, skillList);

    const userBase = (basePrompt || '').trim();
    if (userBase && !isAgentSkillsPrompt(userBase)) {
      skillsPrompt = `${userBase}\n\n${skillsPrompt}`;
    }

    console.log('skills_prompt_built', { count: enabled.length, ids: enabled.map(skill => skill.id) });
    return skillsPrompt;
  }

  async buildConversationalSystemPrompt(): Promise<string> {
    return 'You are a helpful assistant. Use the conversation history to answer follow-up questions accurately and concisely.';
  }

  async syncTools(): Promise<void> {
    if (!(await this.isModeEnabled())) {
      unregisterSkillTools();
      return;
    }
    await registerSkillTools();
  }
}

export const skillManager = new SkillManager();
