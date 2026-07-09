jest.mock('../SkillManager', () => ({
  skillManager: {
    getEnabled: jest.fn().mockResolvedValue([]),
    getSkill: jest.fn(),
  },
}));

import {
  buildCapabilityHeader,
  buildCompactCatalog,
  type SkillCatalogEntry,
} from '../SkillContextService';
import { parsePlan } from '../SkillPlannerService';
import { isCapabilityQuestion } from '../../constants/agentSkillsPrompt';

const sample: SkillCatalogEntry[] = [
  { id: 'qr-code', name: 'QR Code', description: 'Generates a QR code for the given url.' },
  { id: 'tip-split', name: 'Tip Split', description: 'Calculate tip and per-person bill split.' },
  { id: 'send-email', name: 'Send Email', description: 'Send an email.' },
];

describe('skillContext', () => {
  it('builds compact catalog for planner prompts', () => {
    const text = buildCompactCatalog(sample);
    expect(text).toContain('qr-code: QR Code');
    expect(text).toContain('tip-split: Tip Split');
  });

  it('builds capability header for explicit capability answers', () => {
    const header = buildCapabilityHeader(sample);
    expect(header).toContain('QR Code');
    expect(header).toContain('Tip Split');
    expect(header).not.toContain('Prior denials');
  });
});

describe('capabilityQuestions', () => {
  it('detects explicit capability asks', () => {
    expect(isCapabilityQuestion('What can you do?')).toBe(true);
    expect(isCapabilityQuestion('List your skills')).toBe(true);
  });

  it('skips greetings and normal chat', () => {
    expect(isCapabilityQuestion('Hi')).toBe(false);
    expect(isCapabilityQuestion('What is the latest Expo version?')).toBe(false);
  });
});

describe('skillPlanner', () => {
  const catalog = sample;

  it('parses use_skill plan', () => {
    const plan = parsePlan('{"action":"use_skill","skillId":"qr-code","data":"{\\"url\\":\\"https://example.com\\"}"}', catalog);
    expect(plan.action).toBe('use_skill');
    expect(plan.skillId).toBe('qr-code');
  });

  it('parses web_search plan', () => {
    const plan = parsePlan('{"action":"web_search","query":"latest expo sdk"}', catalog);
    expect(plan.action).toBe('web_search');
    expect(plan.query).toBe('latest expo sdk');
  });

  it('falls back to none for invalid skill', () => {
    const plan = parsePlan('{"action":"use_skill","skillId":"missing-skill"}', catalog);
    expect(plan.action).toBe('none');
  });

  it('falls back to none for bad json', () => {
    const plan = parsePlan('not json', catalog);
    expect(plan.action).toBe('none');
  });
});
