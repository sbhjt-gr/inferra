import type { Tool, ToolSchema } from '../tools/ToolRegistry';

export type AgentMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type AgentMessage = {
  id: string;
  role: AgentMessageRole;
  content: string;
  toolCallId?: string;
};

export type AgentToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AgentGenerationSettings = {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  systemPrompt?: string;
};

export type AgentRunOptions = {
  provider: string;
  settings: AgentGenerationSettings;
  onToken?: (token: string) => boolean | void;
  onToolRound?: () => void;
  shouldCancel?: () => boolean;
};

export type ModelTurn =
  | { kind: 'final'; text: string }
  | { kind: 'tool_calls'; calls: AgentToolCall[]; providerState: unknown };

export type ToolOutcome =
  | { ok: true; callId: string; value: string }
  | { ok: false; callId: string; error: AgentError };

export type AgentErrorCode =
  | 'tool_not_found'
  | 'invalid_arguments'
  | 'execution_failed'
  | 'timeout'
  | 'cancelled'
  | 'provider_error'
  | 'loop_limit';

export type AgentError = {
  code: AgentErrorCode;
  message: string;
  retryable?: boolean;
};

export type AgentRunResult =
  | { status: 'completed'; text: string }
  | { status: 'cancelled' }
  | { status: 'failed'; error: AgentError }
  | { status: 'loop_limit' };

export type CatalogEntry = {
  name: string;
  description: string;
  schema: ToolSchema;
};

export type RequestToolCatalog = {
  tools: Tool[];
  entries: CatalogEntry[];
  functionSchemas: ToolSchema[];
};

export interface ModelAdapter {
  readonly id: string;
  supports(provider: string): boolean;
  nextTurn(
    messages: AgentMessage[],
    catalog: RequestToolCatalog,
    settings: AgentGenerationSettings,
    providerState: unknown,
    opts: Pick<AgentRunOptions, 'onToken' | 'shouldCancel'>,
  ): Promise<ModelTurn>;
  appendToolOutcomes(
    messages: AgentMessage[],
    providerState: unknown,
    outcomes: ToolOutcome[],
  ): AgentMessage[];
}
