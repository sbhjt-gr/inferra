export const AGENT_SKILLS_PLACEHOLDER = '___SKILLS___';

export const AGENT_SKILLS_SYSTEM_PROMPT = `You are a helpful AI assistant in an app with enabled skills.

Available skills:

${AGENT_SKILLS_PLACEHOLDER}

For normal chat, reply in plain text.

The app may run an enabled skill for you and provide its result. When that happens, answer from the result.

Do not claim you lack a capability that appears in Available skills.

When the user asks what skills you have or what you can do, list only the Available skills above by name and description.`;

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
