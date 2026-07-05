import type { ProviderType } from './ModelManagementService';
import { OnlineModelService, onlineModelService, type ChatMessage } from './OnlineModelService';
import { appleFoundationService } from './AppleFoundationService';
import { skillActivityAdapter } from './adapters/SkillActivityAdapter';
import { engineService } from './runtime-service';
import { parseToolCallsFromText } from './skillsToolParser';
import { toolExecutor } from './tools/ToolExecutor';
import { toolRegistry, type ToolCall } from './tools/ToolRegistry';
import { generateRandomId } from '../utils/homeScreenUtils';

const MAX_DEVICE_ITERATIONS = 5;

export type SkillLoopOpts = {
  settings: any;
  onToken?: (token: string) => boolean | void;
  onToolRound?: () => void;
  shouldCancel?: () => boolean;
};

const toLoopMessages = (messages: any[]) => {
  return messages
    .filter(entry => entry.role === 'system' || entry.role === 'user' || entry.role === 'assistant')
    .map(entry => ({
      role: entry.role as 'system' | 'user' | 'assistant',
      content: typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content),
    }));
};

const isOnlineProvider = (provider: ProviderType | null): provider is string => {
  return !!provider && ['gemini', 'chatgpt', 'claude'].includes(OnlineModelService.getBaseProvider(provider));
};

const isDeviceProvider = (provider: ProviderType | null): boolean => {
  return provider === 'local' || provider === 'apple-foundation';
};

class SkillToolLoopService {
  private async executeToolCalls(toolCalls: ToolCall[]): Promise<string[]> {
    const outputs: string[] = [];
    for (const call of toolCalls) {
      const name = call.function.name;
      const stepId = skillActivityAdapter.start(`Calling ${name}`, call.function.arguments);
      try {
        const result = await toolExecutor.execute(call);
        skillActivityAdapter.done(stepId, `Called ${name}`);
        outputs.push(result.content);
      } catch (error) {
        skillActivityAdapter.done(stepId, `Failed ${name}`);
        outputs.push(error instanceof Error ? error.message : 'tool_error');
      }
    }
    return outputs;
  }

  private toChatMessages(messages: any[]): ChatMessage[] {
    return messages
      .filter(entry => entry.role === 'system' || entry.role === 'user' || entry.role === 'assistant')
      .map(entry => ({
        id: entry.id || generateRandomId(),
        role: entry.role,
        content: typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content),
      }));
  }

  private async runOnlineLoop(
    activeProvider: string,
    messages: any[],
    opts: SkillLoopOpts,
  ): Promise<string | null> {
    const tools = toolRegistry.getAllTools();
    if (tools.length === 0) {
      return null;
    }

    const base = OnlineModelService.getBaseProvider(activeProvider);
    const isGemini = base === 'gemini';
    const isOpenAI = base === 'chatgpt';
    const isClaude = base === 'claude';
    if (!isGemini && !isOpenAI && !isClaude) {
      return null;
    }

    const apiParams = {
      temperature: opts.settings.temperature,
      maxTokens: opts.settings.maxTokens,
      topP: opts.settings.topP,
      stream: true,
      streamTokens: true,
      systemPrompt: opts.settings.systemPrompt,
    };

    let loopMessages = this.toChatMessages(messages);
    let iteration = 0;
    let fullResponse = '';

    console.log('skill_loop_online_start', { provider: activeProvider, msgCount: loopMessages.length });

    while (!toolExecutor.hasReachedLimit(iteration)) {
      if (opts.shouldCancel?.()) {
        return null;
      }
      iteration += 1;
      console.log('skill_loop_online_iter', { iteration });

      const onToken = opts.onToken
        ? (token: string) => {
            fullResponse += token;
            return opts.onToken?.(token);
          }
        : undefined;

      const response = isGemini
        ? await onlineModelService.sendGeminiWithTools(loopMessages, tools, apiParams, onToken, activeProvider)
        : isOpenAI
          ? await onlineModelService.sendOpenAIWithTools(loopMessages, tools, apiParams, onToken, activeProvider)
          : await onlineModelService.sendClaudeWithTools(loopMessages, tools, apiParams, onToken, activeProvider);

      if (response.toolCalls && response.toolCalls.length > 0) {
        opts.onToolRound?.();
        fullResponse = '';
        console.log('skill_loop_online_tools', { count: response.toolCalls.length });

        if (isGemini) {
          loopMessages.push({
            id: generateRandomId(),
            role: 'assistant',
            content: JSON.stringify({
              type: 'gemini_tool_use_response',
              rawParts: (response as any).rawParts || [],
            }),
          });
        } else if (isClaude) {
          loopMessages.push({
            id: generateRandomId(),
            role: 'assistant',
            content: JSON.stringify({
              type: 'tool_use_response',
              rawContent: (response as any).rawContent || [],
            }),
          });
        } else {
          loopMessages.push({
            id: generateRandomId(),
            role: 'assistant',
            content: response.fullResponse || '',
          });
        }

        const results = await toolExecutor.executeAll(response.toolCalls);
        const toolMap = new Map<string, ToolCall>();
        for (const call of response.toolCalls) {
          toolMap.set(call.id, call);
        }

        for (const result of results) {
          const toolCall = toolMap.get(result.toolCallId);
          if (isGemini) {
            loopMessages.push({
              id: generateRandomId(),
              role: 'user',
              toolCallId: result.toolCallId,
              content: JSON.stringify({
                type: 'function_response',
                id: result.toolCallId,
                name: toolCall?.function.name || 'tool_result',
                response: { result: result.content },
              }),
            });
          } else if (isClaude) {
            loopMessages.push({
              id: generateRandomId(),
              role: 'user',
              toolCallId: result.toolCallId,
              content: result.content,
            });
          } else {
            loopMessages.push({
              id: generateRandomId(),
              role: 'user',
              content: `[Tool result for ${result.toolCallId}]: ${result.content}`,
            });
          }
        }

        const hasOnlyBuiltins = response.toolCalls.every(
          call => toolRegistry.isBuiltin(call.function.name),
        );
        if (hasOnlyBuiltins) {
          const text = (response.fullResponse || '').trim();
          console.log('skill_loop_online_builtin', { len: text.length });
          return text || null;
        }
        continue;
      }

      const text = (response.fullResponse || fullResponse || '').trim();
      console.log('skill_loop_online_done', { len: text.length });
      return text || null;
    }

    console.log('skill_loop_online_limit');
    return null;
  }

  private async generateDeviceText(
    activeProvider: ProviderType | null,
    messages: Array<{ role: string; content: string }>,
    settings: any,
  ): Promise<string> {
    if (activeProvider === 'apple-foundation') {
      return appleFoundationService.generateResponse(
        messages.map(entry => ({
          role: entry.role as 'system' | 'user' | 'assistant',
          content: entry.content,
        })),
        {
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          topP: settings.topP,
        },
      );
    }

    const response = await engineService.mgr().gen(messages as any, {
      settings: {
        ...settings,
        maxTokens: Math.min(settings.maxTokens || 1024, 1024),
      },
    });
    return response || '';
  }

  private async runDeviceLoop(
    activeProvider: ProviderType | null,
    messages: any[],
    opts: SkillLoopOpts,
    seedResponse?: string,
  ): Promise<string | null> {
    if (!isDeviceProvider(activeProvider)) {
      return null;
    }

    if (activeProvider === 'apple-foundation') {
      if (!appleFoundationService.isAvailable() || !(await appleFoundationService.isEnabled())) {
        console.log('skill_loop_apple_off');
        return null;
      }
    } else if (!engineService.ready()) {
      console.log('skill_loop_engine_off');
      return null;
    }

    const loopMessages = toLoopMessages(messages);
    let response: string | undefined = seedResponse;
    let seedOnly = !!seedResponse;

    console.log('skill_loop_device_start', { provider: activeProvider, seeded: seedOnly });

    for (let iteration = 0; iteration < MAX_DEVICE_ITERATIONS; iteration += 1) {
      if (opts.shouldCancel?.()) {
        return null;
      }
      if (toolExecutor.hasReachedLimit(iteration + 1)) {
        break;
      }

      if (!response) {
        response = await this.generateDeviceText(activeProvider, loopMessages, opts.settings);
      }

      const toolCalls = parseToolCallsFromText(response);
      if (toolCalls.length === 0) {
        const text = response.trim();
        if (seedOnly) {
          console.log('skill_loop_seed_plain');
          return null;
        }
        if (text) {
          console.log('skill_loop_device_text', { iteration, len: text.length });
          opts.onToken?.(text);
          return text;
        }
        console.log('skill_loop_device_empty', { iteration });
        return null;
      }

      seedOnly = false;
      opts.onToolRound?.();
      console.log('skill_loop_device_tools', { iteration, count: toolCalls.length });
      loopMessages.push({ role: 'assistant', content: response });
      const results = await this.executeToolCalls(toolCalls);
      for (let index = 0; index < results.length; index += 1) {
        const call = toolCalls[index];
        loopMessages.push({
          role: 'user',
          content: `Tool result for ${call.function.name}: ${results[index]}`,
        });
      }
      response = undefined;
    }

    console.log('skill_loop_device_limit');
    return null;
  }

  async followUpFromResponse(
    activeProvider: ProviderType | null,
    messages: any[],
    initialResponse: string,
    opts: SkillLoopOpts,
  ): Promise<string | null> {
    if (!toolRegistry.hasTools()) {
      console.log('skill_followup_no_tools');
      return null;
    }

    const toolCalls = parseToolCallsFromText(initialResponse);
    if (toolCalls.length === 0) {
      console.log('skill_followup_skip');
      return null;
    }

    console.log('skill_followup_start', { provider: activeProvider, count: toolCalls.length });

    if (isOnlineProvider(activeProvider)) {
      opts.onToolRound?.();
      const loopMessages = this.toChatMessages(messages);
      loopMessages.push({
        id: generateRandomId(),
        role: 'assistant',
        content: initialResponse,
      });
      const results = await this.executeToolCalls(toolCalls);
      for (let index = 0; index < results.length; index += 1) {
        const call = toolCalls[index];
        loopMessages.push({
          id: generateRandomId(),
          role: 'user',
          content: `Tool result for ${call.function.name}: ${results[index]}`,
        });
      }
      return this.runOnlineLoop(activeProvider, loopMessages, opts);
    }

    if (isDeviceProvider(activeProvider)) {
      return this.runDeviceLoop(activeProvider, messages, opts, initialResponse);
    }

    return null;
  }

  async run(
    activeProvider: ProviderType | null,
    messages: any[],
    opts: SkillLoopOpts,
  ): Promise<string | null> {
    if (!toolRegistry.hasTools()) {
      console.log('skill_loop_no_tools');
      return null;
    }

    if (isOnlineProvider(activeProvider)) {
      return this.runOnlineLoop(activeProvider, messages, opts);
    }

    if (isDeviceProvider(activeProvider)) {
      return this.runDeviceLoop(activeProvider, messages, opts);
    }

    console.log('skill_loop_unsupported', { provider: activeProvider });
    return null;
  }
}

export const skillToolLoopService = new SkillToolLoopService();
