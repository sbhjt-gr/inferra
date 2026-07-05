import {
  buildCatalogAnswer,
  buildCapabilityHeader,
  isCapabilityQuestion,
  skillMatchesQuestion,
  type SkillCatalogEntry,
} from '../SkillContextService';
import { parsePlan } from '../SkillPlannerService';

const sample: SkillCatalogEntry[] = [
  { id: 'web-search', name: 'Web Search', description: 'Search the web for current information.' },
  { id: 'qr-code', name: 'QR Code', description: 'Generates a QR code for the given url.' },
  { id: 'tip-split', name: 'Tip Split', description: 'Calculate tip and per-person bill split.' },
];

describe('skillContext', () => {
  it('detects capability questions', () => {
    expect(isCapabilityQuestion('What skills do you have?')).toBe(true);
    expect(isCapabilityQuestion('Can you search the web?')).toBe(true);
    expect(isCapabilityQuestion('Hello there')).toBe(false);
  });

  it('builds catalog answers from enabled skills only', () => {
    const text = buildCatalogAnswer('What skills do you have?', sample);
    expect(text).toContain('Web Search');
    expect(text).toContain('QR Code');
    expect(text).not.toContain('disabled skill');
  });

  it('matches question terms to enabled skills', () => {
    expect(skillMatchesQuestion(sample[0], 'Can you search the web?')).toBe(true);
    expect(skillMatchesQuestion(sample[1], 'generate a qr code')).toBe(true);
    expect(skillMatchesQuestion(sample[2], 'search the web')).toBe(false);
  });

  it('builds capability header', () => {
    const header = buildCapabilityHeader(sample);
    expect(header).toContain('Web Search');
    expect(header).toContain('Prior denials');
  });
});

describe('skillPlanner', () => {
  const catalog = sample;

  it('parses use_skill plan', () => {
    const plan = parsePlan('{"action":"use_skill","skillId":"web-search","data":"{\\"query\\":\\"expo\\"}"}', catalog);
    expect(plan.action).toBe('use_skill');
    expect(plan.skillId).toBe('web-search');
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
