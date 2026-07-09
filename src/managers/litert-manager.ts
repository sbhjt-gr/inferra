import { Platform } from 'react-native';
import {
  createLLM,
  type LLMConfig,
  type LiteRTLMInstance,
  type MemoryUsage,
} from 'react-native-litert-lm';

import { BenchmarkSample, EngineCaps, GenOpts, GenSettings, InferenceManager, Msg } from './inference-manager';
import { getLiteRTRecommendedBackend, type LiteRTBackend } from '../services/LiteRTBackendService';
import { modelSettingsService } from '../services/ModelSettingsService';

type ParsedInput = {
  text: string;
  imagePath?: string;
  audioPath?: string;
};

/** Matches react-native-litert-lm ToolDefinition shape. */
type LitertTool = {
  name: string;
  description: string;
  parametersJson: string;
};

const caps: EngineCaps = {
  embeddings: false,
  vision: Platform.OS !== 'ios',
  audio: Platform.OS !== 'ios',
  rag: false,
  grammar: false,
  jinja: false,
  dry: false,
  mirostat: false,
  xtc: false,
};

class LiteRTManager implements InferenceManager {
  private instance: LiteRTLMInstance | null = null;
  private modelPath: string | null = null;
  private configKey = '';
  private lastConfig: LLMConfig | null = null;
  private genQueue: Promise<unknown> = Promise.resolve();
  private stopRequested = false;

  private async withGenLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.genQueue;
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    this.genQueue = gate;
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async resetSession(force = false): Promise<void> {
    if (!force) {
      await this.genQueue;
    }
    if (!this.instance?.isReady()) {
      return;
    }
    try {
      await this.instance.resetConversation();
      console.log('litert_reset_ok');
    } catch (error) {
      console.log('litert_reset_fail', error instanceof Error ? error.message : 'unknown');
    }
    this.stopRequested = false;
  }

  async recoverInvoke(force = false): Promise<void> {
    if (!force) {
      await this.genQueue;
    }
    if (!this.modelPath || !this.lastConfig) {
      console.log('litert_recover_skip');
      return;
    }
    console.log('litert_invoke_recover');
    try {
      await this.resetSession(true);
      if (this.instance?.isReady()) {
        console.log('litert_recover_reset_ok');
        return;
      }
    } catch {
      console.log('litert_recover_reset_fail');
    }
    try {
      this.getInstance().close();
    } catch {
    }
    this.instance = createLLM();
    await this.instance.loadModel(this.modelPath, this.lastConfig);
    this.configKey = this.getConfigKey(this.lastConfig);
    console.log('litert_invoke_recover_ok');
  }

  private async recoverFromPrefillError(error: unknown): Promise<void> {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes('Prefill') && !msg.includes('already started')) {
      return;
    }
    console.log('litert_prefill_recover');
    await this.resetSession(true);
  }

  private normalizePath(path: string): string {
    return path.startsWith('file://') ? path.slice(7) : path;
  }

  private getModelSettingPaths(): string[] {
    if (!this.modelPath) {
      return [];
    }

    const rawPath = this.modelPath;
    const filePath = rawPath.startsWith('file://') ? rawPath : `file://${rawPath}`;

    return Array.from(new Set([rawPath, filePath]));
  }

  private async resolveBackend(): Promise<LiteRTBackend> {
    for (const path of this.getModelSettingPaths()) {
      const config = await modelSettingsService.getModelSettings(path);
      if (config.litertBackend) {
        return config.litertBackend;
      }
    }

    return getLiteRTRecommendedBackend();
  }

  private async createConfig(): Promise<LLMConfig> {
    const config: LLMConfig = {
      backend: await this.resolveBackend(),
      maxTokens: 1024,
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
    };

    // Explicit multimodal flag: enable when model filename suggests multimodal
    if (this.modelPath) {
      const name = this.modelPath.toLowerCase();
      if (name.includes('3n') || name.includes('gemma3') || name.includes('gemma-4')) {
        config.multimodal = true;
      }
    }

    return config;
  }

  private getConfigKey(config: LLMConfig): string {
    return JSON.stringify({
      backend: config.backend ?? getLiteRTRecommendedBackend(),
      systemPrompt: config.systemPrompt ?? '',
      tools: config.tools?.map(tool => tool.name).join(',') ?? '',
    });
  }

  private async buildConfig(messages: Msg[], settings?: Partial<GenSettings>, tools?: LitertTool[]): Promise<LLMConfig> {
    const config = await this.createConfig();
    const systemPrompt = this.extractSystemPrompt(messages, settings);

    if (typeof settings?.maxTokens === 'number') {
      config.maxTokens = settings.maxTokens;
    }
    if (typeof settings?.temperature === 'number') {
      config.temperature = settings.temperature;
    }
    if (typeof settings?.topK === 'number') {
      config.topK = settings.topK;
    }
    if (typeof settings?.topP === 'number') {
      config.topP = settings.topP;
    }
    if (systemPrompt) {
      config.systemPrompt = systemPrompt;
    }
    if (tools && tools.length > 0) {
      config.tools = tools;
    }
    if (typeof settings?.validate === 'boolean') {
      config.validate = settings.validate;
    }
    if (typeof settings?.enableSpeculativeDecoding === 'boolean') {
      config.enableSpeculativeDecoding = settings.enableSpeculativeDecoding;
    }

    return config;
  }

  private getInstance(): LiteRTLMInstance {
    if (!this.instance) {
      this.instance = createLLM();
    }
    return this.instance;
  }

  private async ensureLoaded(config: LLMConfig, reuseSession = false): Promise<LiteRTLMInstance> {
    if (!this.modelPath) {
      throw new Error('engine_not_ready');
    }

    const current = this.getInstance();
    if (reuseSession && current.isReady()) {
      console.log('litert_reuse_ready');
      return current;
    }

    const key = this.getConfigKey(config);
    if (current.isReady() && this.configKey === key) {
      console.log('litert_config_same');
      this.lastConfig = config;
      return current;
    }

    console.log('litert_reload', {
      ready: current.isReady(),
      reuse: reuseSession,
      sameKey: this.configKey === key,
    });

    try {
      current.close();
    } catch {
    }

    this.instance = createLLM();
    await this.instance.loadModel(this.modelPath, config);
    this.configKey = key;
    this.lastConfig = config;
    return this.instance;
  }

  private extractSystemPrompt(messages: Msg[], settings?: Partial<GenSettings>): string | undefined {
    const fallback = settings?.systemPrompt?.trim();
    const firstMessage = messages[0];
    if (firstMessage?.role === 'system') {
      const text = this.extractText(firstMessage.content);
      if (text) {
        if (fallback && fallback !== text) {
          return fallback;
        }
        return text;
      }
    }

    return fallback || undefined;
  }

  private extractText(content: unknown): string {
    if (typeof content !== 'string') {
      return '';
    }

    const raw = content.trim();
    if (!raw) {
      return '';
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return raw;
      }

      if (parsed.type === 'multimodal' && Array.isArray(parsed.content)) {
        const textPart = parsed.content.find(
          (item: { type?: string; text?: string }) => item?.type === 'text' && typeof item?.text === 'string',
        );
        return (textPart?.text || '').trim();
      }

      if (parsed.type === 'ocr_result') {
        const userPrompt = typeof parsed.userPrompt === 'string' ? parsed.userPrompt.trim() : '';
        if (userPrompt) {
          return userPrompt;
        }
        const extractedText = typeof parsed.extractedText === 'string' ? parsed.extractedText.trim() : '';
        if (extractedText) {
          return extractedText;
        }
        return '';
      }

      if (parsed.type === 'file_upload') {
        const userContent = typeof parsed.userContent === 'string' ? parsed.userContent.trim() : '';
        if (userContent) {
          return userContent;
        }
        const instruction = typeof parsed.internalInstruction === 'string'
          ? parsed.internalInstruction.trim()
          : '';
        return instruction;
      }

      if (parsed.type === 'photo_upload' || parsed.type === 'audio_upload') {
        const userContent = typeof parsed.userContent === 'string' ? parsed.userContent.trim() : '';
        return userContent;
      }

      return raw;
    } catch {
      return raw;
    }
  }

  private extractMediaPath(instruction: string, label: 'Photo URI' | 'Audio URI'): string | undefined {
    const match = instruction.match(new RegExp(`${label}:\\s*(.+)`));
    if (!match?.[1]) {
      return undefined;
    }
    return this.normalizePath(match[1].trim());
  }

  private parseInput(content: unknown): ParsedInput {
    if (typeof content !== 'string') {
      return { text: '' };
    }

    const raw = content.trim();
    if (!raw) {
      return { text: '' };
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return { text: raw };
      }

      if (parsed.type === 'multimodal' && Array.isArray(parsed.content)) {
        let text = '';
        let imagePath: string | undefined;
        let audioPath: string | undefined;

        for (const item of parsed.content) {
          if (item?.type === 'text' && typeof item?.text === 'string') {
            text = item.text.trim();
            continue;
          }
          if (!imagePath && item?.type === 'image' && typeof item?.uri === 'string') {
            imagePath = this.normalizePath(item.uri);
            continue;
          }
          if (!audioPath && item?.type === 'audio' && typeof item?.uri === 'string') {
            audioPath = this.normalizePath(item.uri);
          }
        }

        return { text, imagePath, audioPath };
      }

      if (parsed.type === 'photo_upload') {
        return {
          text: typeof parsed.userContent === 'string' && parsed.userContent.trim()
            ? parsed.userContent.trim()
            : 'Describe this image.',
          imagePath: this.extractMediaPath(String(parsed.internalInstruction || ''), 'Photo URI'),
        };
      }

      if (parsed.type === 'audio_upload') {
        return {
          text: typeof parsed.userContent === 'string' && parsed.userContent.trim()
            ? parsed.userContent.trim()
            : 'Transcribe or describe this audio.',
          audioPath: this.extractMediaPath(String(parsed.internalInstruction || ''), 'Audio URI'),
        };
      }

      if (parsed.type === 'ocr_result') {
        const userPrompt = typeof parsed.userPrompt === 'string' ? parsed.userPrompt.trim() : '';
        const extractedText = typeof parsed.extractedText === 'string' ? parsed.extractedText.trim() : '';
        return {
          text: userPrompt || extractedText,
        };
      }

      if (parsed.type === 'file_upload') {
        const userContent = typeof parsed.userContent === 'string' ? parsed.userContent.trim() : '';
        const instruction = typeof parsed.internalInstruction === 'string'
          ? parsed.internalInstruction.trim()
          : '';
        return {
          text: userContent || instruction,
        };
      }

      return { text: raw };
    } catch {
      return { text: raw };
    }
  }

  private getLastUserInput(messages: Msg[]): ParsedInput {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== 'user') {
        continue;
      }

      const input = this.parseInput(message.content);
      if (input.text || input.imagePath || input.audioPath) {
        return input;
      }
    }

    return { text: '' };
  }

  private getMessageText(message: Msg): string {
    if (typeof message.content !== 'string') {
      return '';
    }

    if (message.role === 'assistant') {
      return message.content.trim();
    }

    return this.parseInput(message.content).text.trim();
  }

  private summarizeForHistory(text: string, max = 350): string {
    const trimmed = text.trim();
    if (!trimmed) {
      return '';
    }
    if (trimmed.length <= max) {
      return trimmed;
    }
    return `${trimmed.slice(0, max)}...`;
  }

  private buildFullConversationPrompt(messages: Msg[]): string {
    const priorLines: string[] = [];
    const nonSystem = messages.filter(message => message.role !== 'system');
    let lastUserIndex = -1;

    for (let index = nonSystem.length - 1; index >= 0; index -= 1) {
      if (nonSystem[index].role === 'user') {
        lastUserIndex = index;
        break;
      }
    }

    for (let index = 0; index < nonSystem.length; index += 1) {
      if (index === lastUserIndex) {
        continue;
      }

      const text = this.summarizeForHistory(this.getMessageText(nonSystem[index]));
      if (!text) {
        continue;
      }

      if (nonSystem[index].role === 'user') {
        priorLines.push(`User: ${text}`);
        continue;
      }

      if (nonSystem[index].role === 'assistant') {
        priorLines.push(`Assistant: ${text}`);
      }
    }

    const input = this.getLastUserInput(messages);
    const question = input.text?.trim() || '';
    if (!question) {
      return '';
    }

    if (priorLines.length === 0) {
      return question;
    }

    const recentLines = priorLines.slice(-4);
    let prompt = `Here is the conversation so far:\n${recentLines.join('\n')}\n\nAnswer this follow-up question: ${question}`;
    const maxChars = 2000;
    if (prompt.length > maxChars) {
      prompt = prompt.slice(-maxChars);
      console.log('litert_prompt_trim', { maxChars });
    }
    return prompt;
  }

  private applySkillHeader(prompt: string, skillHeader?: string): string {
    if (!skillHeader?.trim()) {
      return prompt;
    }
    return `${skillHeader.trim()}\n\n${prompt}`;
  }

  private countUserTurns(messages: Msg[]): number {
    return messages.filter(message => message.role === 'user').length;
  }

  async init(modelPath: string) {
    this.modelPath = this.normalizePath(modelPath);
    const config = await this.createConfig();
    const instance = this.getInstance();

    try {
      instance.close();
    } catch {
    }

    this.instance = createLLM();
    await this.instance.loadModel(this.modelPath, config);
    this.configKey = this.getConfigKey(config);
    this.lastConfig = config;
  }

  async gen(messages: Msg[], opts?: GenOpts) {
    return this.withGenLock(() => this.runGen(messages, opts));
  }

  private async runGen(messages: Msg[], opts?: GenOpts): Promise<string> {
    try {
      return await this.runGenOnce(messages, opts);
    } catch (error) {
      await this.recoverFromPrefillError(error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Prefill') || msg.includes('already started')) {
        console.log('litert_gen_retry');
        return this.runGenOnce(messages, opts);
      }
      if (!this.isInvokeError(msg)) {
        throw error;
      }
      const singleTurn = this.countUserTurns(messages) > 1;
      if (singleTurn) {
        console.log('litert_single_retry');
        await this.resetSession(true);
        try {
          return await this.runGenOnce(messages, opts, true);
        } catch (retryError) {
          const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
          if (!this.isInvokeError(retryMsg)) {
            throw retryError;
          }
        }
      }
      console.log('litert_reload_retry');
      await this.recoverInvoke(true);
      return this.runGenOnce(messages, opts, singleTurn);
    }
  }

  private isInvokeError(msg: string): boolean {
    return msg.includes('Failed to invoke') || msg.includes('sendMessage failed');
  }

  private async runGenOnce(messages: Msg[], opts?: GenOpts, singleTurn = false): Promise<string> {
    const input = this.getLastUserInput(messages);
    if (!input.text && !input.imagePath && !input.audioPath) {
      return '';
    }

    const instance = await this.ensureLoaded(
      await this.buildConfig(messages, opts?.settings, opts?.tools as LitertTool[] | undefined),
      opts?.reuseSession,
    );
    if (opts?.reuseSession) {
      try {
        await instance.resetConversation();
        console.log('litert_reuse_reset');
      } catch (error) {
        console.log('litert_reuse_reset_fail', error instanceof Error ? error.message : 'unknown');
      }
    }
    const userTurns = this.countUserTurns(messages);
    const historyPrompt = !singleTurn && userTurns > 1 ? this.buildFullConversationPrompt(messages) : '';
    let prompt = input.text || 'Describe this input.';

    if (historyPrompt) {
      try {
        await instance.resetConversation();
        console.log('litert_multi_reset', { userTurns });
      } catch (error) {
        console.log('litert_multi_reset_fail', error instanceof Error ? error.message : 'unknown');
      }
      prompt = this.applySkillHeader(historyPrompt, opts?.skillHeader);
      console.log('litert_multi_prompt', { userTurns, len: prompt.length, skills: !!opts?.skillHeader });
    } else if (opts?.skillHeader && userTurns === 1) {
      prompt = this.applySkillHeader(prompt, opts.skillHeader);
    }

    const onToken = opts?.onToken;

    // Streaming multimodal
    if (onToken && input.imagePath && caps.vision) {
      return this.streamAsync(onToken, (cb) => {
        instance.sendMessageWithImageAsync(prompt, input.imagePath!, cb);
      });
    }

    if (onToken && input.audioPath && caps.audio) {
      return this.streamAsync(onToken, (cb) => {
        instance.sendMessageWithAudioAsync(prompt, input.audioPath!, cb);
      });
    }

    // Blocking multimodal
    if (input.imagePath && caps.vision) {
      const response = await instance.sendMessageWithImage(prompt, input.imagePath);
      onToken?.(response);
      return response;
    }

    if (input.audioPath && caps.audio) {
      const response = await instance.sendMessageWithAudio(prompt, input.audioPath);
      onToken?.(response);
      return response;
    }

    // Text only
    if (!onToken) {
      return instance.sendMessage(prompt);
    }

    return this.streamAsync(onToken, (cb) => {
      instance.sendMessageAsync(prompt, cb);
    });
  }

  /** Wrap a streaming inference call into a Promise that resolves with the full response. */
  private streamAsync(
    onToken: (token: string) => boolean | void,
    call: (cb: (token: string, done: boolean) => void) => void,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let output = '';
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        fn();
      };
      try {
        call((token, done) => {
          if (settled) {
            return;
          }
          if (this.stopRequested) {
            if (done) {
              finish(() => resolve(output));
            }
            return;
          }
          if (token.startsWith('Error: ')) {
            finish(() => reject(new Error(token.slice(7))));
            return;
          }
          output += token;
          onToken(token);
          if (done) {
            finish(() => resolve(output));
          }
        });
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    });
  }

  async benchmark(prompt: string, opts?: GenOpts): Promise<BenchmarkSample> {
    const messages: Msg[] = [];
    const systemPrompt = opts?.settings?.systemPrompt?.trim();

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const instance = await this.ensureLoaded(await this.buildConfig(messages, opts?.settings));
    await instance.resetConversation();
    await instance.sendMessage(prompt);
    const stats = instance.getStats();
    const promptTokens = stats.promptTokens || Math.max(prompt.length / 4, 1);
    const completionTokens = stats.completionTokens || Math.max(stats.totalTokens - promptTokens, 1);
    const ttftMs = stats.timeToFirstToken || 0;
    const totalTimeMs = stats.totalTime || 0;
    const decodeWindowMs = Math.max(totalTimeMs - ttftMs, 1);

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      ttftMs,
      totalTimeMs,
      prefillTokensPerSecond: ttftMs > 0 ? promptTokens / (ttftMs / 1000) : 0,
      decodeTokensPerSecond: completionTokens > 0
        ? completionTokens / (decodeWindowMs / 1000)
        : stats.tokensPerSecond || 0,
    };
  }

  async release() {
    if (this.instance) {
      try {
        this.instance.close();
      } catch {
      }
    }

    this.instance = null;
    this.modelPath = null;
    this.configKey = '';
  }

  stop() {
    this.stopRequested = true;
    void this.resetSession(true);
  }

  caps() {
    return caps;
  }

  ready() {
    return Boolean(this.instance?.isReady());
  }

  /**
   * Count tokens in a text string using the native tokenizer.
   * Returns -1 if no model is loaded or tokenizer is unavailable.
   */
  countTokens(text: string): number {
    if (!this.instance?.isReady()) {
      return -1;
    }
    return this.instance.countTokens(text);
  }

  /**
   * Get real memory usage from the native runtime.
   * Returns null if no model is loaded.
   */
  getMemoryUsage(): MemoryUsage | null {
    if (!this.instance?.isReady()) {
      return null;
    }
    return this.instance.getMemoryUsage();
  }
}

export const litertManager = new LiteRTManager();