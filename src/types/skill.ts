export type SkillType = 'text' | 'js';

export type SkillSource = 'builtin' | 'url' | 'local';

export type SkillSecret = {
  label: string;
  required: boolean;
};

export type SkillMetadata = {
  homepage?: string;
  requireSecret?: boolean;
  scriptName?: string;
};

export type SkillResult = {
  result?: string;
  error?: string;
  title?: string;
  summary?: string;
  facts?: string[];
  image?: {
    base64: string;
    mimeType: string;
  };
  webview?: {
    url: string;
  };
};

export type Skill = {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  instructions: string;
  scriptHtml?: string;
  baseUrl?: string;
  packageDir?: string;
  source: SkillSource;
  sourceUrl?: string;
  enabled: boolean;
  metadata?: SkillMetadata;
  secret?: SkillSecret;
  handler?: string;
};

export type SkillImportPayload = {
  name: string;
  description?: string;
  instructions: string;
  type?: SkillType;
  scriptHtml?: string;
  scriptUrl?: string;
  metadata?: SkillMetadata;
  secret?: SkillSecret;
  handler?: string;
};
