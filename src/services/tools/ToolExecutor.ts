import { skillActivityAdapter } from '../adapters/SkillActivityAdapter';
import { toolApproval } from '../capabilities/ToolApproval';
import { toolAuditStore } from '../capabilities/ToolAuditStore';
import { toolPolicyStore } from '../capabilities/ToolPolicyStore';
import { toolRegistry, type ToolCall, type ToolResult } from './ToolRegistry';
import { clampToolResult, validateToolArgs } from './ToolValidator';
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

const summarizeArgs = (args: Record<string, unknown>): string => {
  const keys = Object.keys(args);
  if (!keys.length) {
    return 'no args';
  }
  return `args: ${keys.slice(0, 6).join(', ')}`;
};

const withTimeout = async <T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

class ToolExecutorClass {
  toAgentCall(call: ToolCall): AgentToolCall {
    return {
      id: call.id,
      name: call.function.name,
      arguments: parseArgs(call.function.arguments),
    };
  }

  async executeStructured(
    call: AgentToolCall,
    opts?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<ToolOutcome> {
    const name = call.name;
    const started = Date.now();
    const requestId = call.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    console.log('tool_exec_start', name);

    if (toolRegistry.isBuiltin(name)) {
      return {
        ok: false,
        callId: call.id,
        error: { code: 'tool_not_found', message: `Builtin tool "${name}" is provider-executed.` },
      };
    }

    const meta = toolRegistry.getMeta(name);
    const executor = toolRegistry.getExecutor(name);
    if (!executor || !meta) {
      return {
        ok: false,
        callId: call.id,
        error: { code: 'tool_not_found', message: `Tool "${name}" not found.` },
      };
    }

    if (!toolPolicyStore.isAllowed(name, meta.source)) {
      await toolAuditStore.record({
        tool: name,
        source: meta.source,
        decision: 'denied',
        outcome: 'denied',
        durationMs: Date.now() - started,
      });
      return {
        ok: false,
        callId: call.id,
        error: { code: 'policy_denied', message: `Tool "${name}" is disabled by policy.` },
      };
    }

    const validationError = validateToolArgs(name, toolRegistry.getSchema(name), call.arguments);
    if (validationError) {
      await toolAuditStore.record({
        tool: name,
        source: meta.source,
        decision: 'denied',
        outcome: 'error',
        durationMs: Date.now() - started,
      });
      return { ok: false, callId: call.id, error: validationError };
    }

    const approved = await toolApproval.request({
      requestId,
      tool: name,
      source: meta.source,
      risk: meta.risk,
      summary: summarizeArgs(call.arguments),
    });
    if (!approved) {
      await toolAuditStore.record({
        tool: name,
        source: meta.source,
        decision: 'denied',
        outcome: 'denied',
        durationMs: Date.now() - started,
      });
      return {
        ok: false,
        callId: call.id,
        error: { code: 'approval_denied', message: `Tool "${name}" was not approved.` },
      };
    }

    const stepId = skillActivityAdapter.start(`Calling ${name}`);
    try {
      const value = await withTimeout(async signal => {
        if (opts?.signal?.aborted || signal.aborted) {
          throw new Error('tool_cancelled');
        }
        const merged = new AbortController();
        const onAbort = () => merged.abort();
        opts?.signal?.addEventListener('abort', onAbort);
        signal.addEventListener('abort', onAbort);
        try {
          return await executor(call.arguments, { signal: merged.signal, requestId });
        } finally {
          opts?.signal?.removeEventListener('abort', onAbort);
          signal.removeEventListener('abort', onAbort);
        }
      }, opts?.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS);

      const clamped = clampToolResult(value);
      skillActivityAdapter.done(stepId, `Called ${name}`);
      await toolAuditStore.record({
        tool: name,
        source: meta.source,
        decision: 'ok',
        outcome: 'ok',
        durationMs: Date.now() - started,
      });
      console.log('tool_exec_ok', name);
      return { ok: true, callId: call.id, value: clamped };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      const code: AgentError['code'] =
        message === 'tool_timeout' || message.includes('aborted')
          ? message.includes('cancel') || message.includes('abort')
            ? 'cancelled'
            : 'timeout'
          : message === 'tool_cancelled'
            ? 'cancelled'
            : 'execution_failed';
      skillActivityAdapter.done(stepId, `Failed ${name}`);
      await toolAuditStore.record({
        tool: name,
        source: meta.source,
        decision: code === 'cancelled' ? 'cancelled' : 'failed',
        outcome: code === 'cancelled' ? 'cancelled' : 'error',
        durationMs: Date.now() - started,
      });
      console.log('tool_exec_fail', name, code);
      return {
        ok: false,
        callId: call.id,
        error: { code, message, retryable: code === 'timeout' },
      };
    }
  }

  async executeAllStructured(
    calls: AgentToolCall[],
    opts?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<ToolOutcome[]> {
    const results: ToolOutcome[] = [];
    for (const call of calls) {
      if (opts?.signal?.aborted) {
        results.push({
          ok: false,
          callId: call.id,
          error: { code: 'cancelled', message: 'cancelled' },
        });
        continue;
      }
      results.push(await this.executeStructured(call, opts));
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
