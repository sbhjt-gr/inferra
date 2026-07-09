export const AGENT_SKILLS_PLACEHOLDER = '___SKILLS___';

export const AGENT_SKILLS_SYSTEM_PROMPT = `You are a helpful AI assistant in an app with enabled skills.

Available skills:

${AGENT_SKILLS_PLACEHOLDER}

For normal chat, reply in plain text.

The app may run an enabled skill for you and provide its result. When that happens, answer from the result.

Do not claim you lack a capability that appears in Available skills.

When the user asks what skills you have or what you can do, answer in natural language grounded in the Available skills above plus any always-available tools mentioned in this prompt. Do not invent skills that are not listed.`;

export const isAgentSkillsPrompt = (prompt?: string): boolean => {
  if (!prompt?.trim()) {
    return false;
  }
  return prompt.includes(AGENT_SKILLS_PLACEHOLDER) || prompt.includes('Available skills:');
};

export const extractUserBasePrompt = (prompt?: string): string => {
  const trimmed = prompt?.trim() || '';
  if (!trimmed) {
    return '';
  }
  const marker = 'You are a helpful AI assistant in an app with enabled skills.';
  const idx = trimmed.indexOf(marker);
  if (idx > 0) {
    return trimmed.slice(0, idx).trim();
  }
  if (isAgentSkillsPrompt(trimmed)) {
    return '';
  }
  return trimmed;
};

export const isCapabilityQuestion = (text: string): boolean => {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return /\b(what can you do|what skills|what tools|your capabilities|what are you able|list your skills)\b/.test(normalized);
};
