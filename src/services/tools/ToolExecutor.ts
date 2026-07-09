import { skillActivityAdapter } from '../adapters/SkillActivityAdapter';
import { toolRegistry, type ToolCall, type ToolResult } from './ToolRegistry';
import type { AgentError, AgentToolCall, ToolOutcome } from '../agent/AgentTypes';

const MAX_ITERATIONS = 5;
const DEFAULT_TOOL_TIMEOUT_MS = 30000;

const parseArgs = (raw: string): Record<string, unknown> => {
  if (!raw?.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
};

const validateRequired = (name: string, args: Record<string, unknown>): AgentError | null => {
  const schema = toolRegistry.getSchema(name);
  if (!schema) {
    return null;
  }
  const required = schema.function.parameters.required || [];
  for (const key of required) {
    const value = args[key];
    if (value == null || (typeof value === 'string' && !value.trim())) {
      return {
        code: 'invalid_arguments',
        message: `Missing required argument "${key}" for tool "${name}".`,
      };
    }
  }
  return null;
};

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('tool_timeout')), ms);
    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

class ToolExecutorClass {
  toAgentCall(call: ToolCall): AgentToolCall {
    return {
      id: call.id,
      name: call.function.name,
      arguments: parseArgs(call.function.arguments),
    };
  }

  async executeStructured(call: AgentToolCall, opts?: { timeoutMs?: number }): Promise<ToolOutcome> {
    const name = call.name;
    if (toolRegistry.isBuiltin(name)) {
      return {
        ok: false,
        callId: call.id,
        error: { code: 'tool_not_found', message: `Builtin tool "${name}" is provider-executed.` },
      };
    }

    const executor = toolRegistry.getExecutor(name);
    if (!executor) {
      return {
        ok: false,
        callId: call.id,
        error: { code: 'tool_not_found', message: `Tool "${name}" not found.` },
      };
    }

    const validationError = validateRequired(name, call.arguments);
    if (validationError) {
      return { ok: false, callId: call.id, error: validationError };
    }

    const stepId = skillActivityAdapter.start(`Calling ${name}`, JSON.stringify(call.arguments));
    try {
      const value = await withTimeout(
        executor(call.arguments as Record<string, any>),
        opts?.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
      );
      skillActivityAdapter.done(stepId, `Called ${name}`);
      return { ok: true, callId: call.id, value };
    } catch (error) {
      skillActivityAdapter.done(stepId, `Failed ${name}`);
      const message = error instanceof Error ? error.message : 'unknown_error';
      const code: AgentError['code'] = message === 'tool_timeout' ? 'timeout' : 'execution_failed';
      return {
        ok: false,
        callId: call.id,
        error: { code, message, retryable: code === 'timeout' },
      };
    }
  }

  async executeAllStructured(calls: AgentToolCall[]): Promise<ToolOutcome[]> {
    const results: ToolOutcome[] = [];
    for (const call of calls) {
      results.push(await this.executeStructured(call));
    }
    return results;
  }

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const structured = await this.executeStructured(this.toAgentCall(toolCall));
    if (structured.ok) {
      return { toolCallId: structured.callId, content: structured.value };
    }
    return {
      toolCallId: structured.callId,
      content: JSON.stringify({ error: structured.error.message, code: structured.error.code }),
    };
  }

  async executeAll(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const call of toolCalls) {
      if (toolRegistry.isBuiltin(call.function.name)) {
        continue;
      }
      results.push(await this.execute(call));
    }
    return results;
  }

  hasReachedLimit(iteration: number): boolean {
    return iteration >= MAX_ITERATIONS;
  }

  getMaxIterations(): number {
    return MAX_ITERATIONS;
  }
}

export const toolExecutor = new ToolExecutorClass();
