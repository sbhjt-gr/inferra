export type EngineId = 'llama' | 'mlx' | 'litert';

export const engineLabels: Record<EngineId, string> = {
  llama: 'Llama.cpp',
  mlx: 'MLX',
  litert: 'LiteRT-LM',
};

export type Msg = {
  role: string;
  content: string | any;
};

export type EngineCaps = {
  embeddings: boolean;
  vision: boolean;
  audio: boolean;
  rag: boolean;
  grammar: boolean;
  jinja: boolean;
  dry: boolean;
  mirostat: boolean;
  xtc: boolean;
};

export type BenchmarkSample = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  ttftMs: number;
  totalTimeMs: number;
  prefillTokensPerSecond: number;
  decodeTokensPerSecond: number;
};

export type GenSettings = {
  maxTokens: number;
  temperature: number;
  topK: number;
  topP: number;
  minP: number;
  stopWords: string[];
  seed: number;
  penaltyRepeat: number;
  penaltyFreq: number;
  penaltyPresent: number;
  mirostat: number;
  mirostatTau: number;
  mirostatEta: number;
  dryMultiplier: number;
  dryBase: number;
  dryAllowedLength: number;
  dryPenaltyLastN: number;
  drySequenceBreakers: string[];
  grammar: string;
  jinja: boolean;
  xtcProbability: number;
  xtcThreshold: number;
  typicalP: number;
  enableThinking: boolean;
  systemPrompt: string;
  /** Validate engine with a test inference after loading (GPU/NPU only). */
  validate?: boolean;
  /** Enable speculative decoding for faster generation on supported models. */
  enableSpeculativeDecoding?: boolean;
};

export type GenOpts = {
  settings?: Partial<GenSettings>;
  onToken?: (token: string) => boolean | void;
  /** Native tool definitions for engines that support function calling (LiteRT-LM). */
  tools?: any[];
  /** Skip cached LiteRT tools and load plain chat config. */
  skipStableTools?: boolean;
  /** Keep loaded model; only reset conversation (LiteRT summarize / follow-up). */
  reuseSession?: boolean;
  /** Compact enabled-skills header for LiteRT multi-turn prompts. */
  skillHeader?: string;
};

export interface InferenceManager {
  init(modelPath: string, projectorPath?: string): Promise<void>;
  gen(messages: Msg[], opts?: GenOpts): Promise<string>;
  embed?(text: string): Promise<number[]>;
  benchmark?(prompt: string, opts?: GenOpts): Promise<BenchmarkSample>;
  stop?(): void;
  release(): Promise<void>;
  caps(): EngineCaps;
  ready(): boolean;
}
