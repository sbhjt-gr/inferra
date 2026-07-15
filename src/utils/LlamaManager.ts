import {
  initLlama,
  loadLlamaModelInfo,
  getBackendDevicesInfo,
  releaseAllLlama,
  type LlamaContext,
  type EmbeddingParams,
  type NativeBackendDeviceInfo,
} from 'llama.rn';
import { Platform, NativeModules } from 'react-native';
import { fs as FileSystem } from '../services/fs';
import EventEmitter from 'eventemitter3';
import { ModelSettings } from '../services/ModelSettingsService';
import { 
  ModelMemoryInfo, 
  LlamaManagerInterface, 
  LlamaManagerEvents,
  ProcessedMessage,
  MultimodalSupport 
} from '../types/llama';
import { MultimodalService } from '../services/MultimodalService';
import { TokenProcessingService } from '../services/TokenProcessingService';
import { LlamaSettingsManager } from '../services/LlamaSettingsManager';
import { DEFAULT_SETTINGS, LLAMA_INIT_CONFIG, TITLE_GENERATION_CONFIG } from '../config/llamaConfig';
import { gpuSettingsService } from '../services/GpuSettingsService';
import { checkGpuSupport, type GpuSupport } from './gpuCapabilities';
import type { BenchmarkSample } from '../managers/inference-manager';

const LlamaManagerModule = NativeModules.LlamaManager as LlamaManagerInterface;

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
};

class LlamaManager {
  private context: LlamaContext | null = null;
  private modelPath: string | null = null;
  private backendDevices: NativeBackendDeviceInfo[] = [];
  private nextInitOverrides: Partial<{
    n_ctx: number;
    n_batch: number;
    n_parallel: number;
    n_threads: number;
    n_gpu_layers: number;
  }> | null = null;
  private events = new EventEmitter<LlamaManagerEvents>();
  private isCancelled: boolean = false;
  private isUnloading: boolean = false;
  private genLock: Promise<void> = Promise.resolve();
  
  private multimodalService = new MultimodalService();
  private tokenProcessingService = new TokenProcessingService();
  private settingsManager = new LlamaSettingsManager();

  private genLockRelease: (() => void) | null = null;

  private static GEN_LOCK_TIMEOUT = 30000;

  isGenBusy(): boolean {
    return this.genLockRelease !== null;
  }

  private async acquireGenLock(timeoutMs: number = LlamaManager.GEN_LOCK_TIMEOUT): Promise<void> {
    if (this.genLockRelease !== null) {
      if (timeoutMs <= 0) {
        console.log('gen_lock_busy');
        throw new Error('MODEL_BUSY');
      }
      console.log('gen_lock_wait', timeoutMs);
      await Promise.race([
        this.genLock,
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('MODEL_BUSY')), timeoutMs);
        }),
      ]);
    } else {
      await this.genLock;
    }
    let release: () => void;
    this.genLock = new Promise<void>(resolve => { release = resolve; });
    this.genLockRelease = release!;
    console.log('gen_lock_acquired');
  }

  private releaseGenLock(): void {
    if (this.genLockRelease) {
      this.genLockRelease();
      this.genLockRelease = null;
      console.log('gen_lock_release');
    }
  }

  private resolveSettings(customSettings?: Partial<ModelSettings>): ModelSettings {
    const base = this.settingsManager.getSettings();
    const merged: ModelSettings = {
      ...DEFAULT_SETTINGS,
      ...base,
      ...(customSettings || {}),
      stopWords: customSettings?.stopWords ?? base.stopWords ?? DEFAULT_SETTINGS.stopWords,
      drySequenceBreakers:
        customSettings?.drySequenceBreakers ?? base.drySequenceBreakers ?? DEFAULT_SETTINGS.drySequenceBreakers,
      logitBias: customSettings?.logitBias ?? base.logitBias ?? DEFAULT_SETTINGS.logitBias,
    };
    console.log('settings_merged', {
      hasCustom: !!customSettings,
      stopLen: merged.stopWords?.length ?? 0,
      biasLen: merged.logitBias?.length ?? 0,
    });
    return merged;
  }

  private resolveUseMmapValue(value: unknown): boolean {
    if (value === 'false' || value === false) {
      return false;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'smart' || value === undefined || value === null) {
      return true;
    }
    return Boolean(value);
  }

  private toCompatInitParams(params: Record<string, any>) {
    return {
      model: params.model,
      n_ctx: params.n_ctx,
      n_batch: params.n_batch,
      n_ubatch: params.n_ubatch,
      n_parallel: params.n_parallel,
      n_threads: params.n_threads,
      n_gpu_layers: params.n_gpu_layers,
      use_mlock: typeof params.use_mlock === 'boolean' ? params.use_mlock : false,
      use_mmap: this.resolveUseMmapValue(params.use_mmap),
      cache_type_k: params.cache_type_k,
      cache_type_v: params.cache_type_v,
      flash_attn_type: params.flash_attn_type,
      kv_unified: params.kv_unified,
      no_extra_bufts: params.no_extra_bufts,
      embedding: params.embedding,
      ctx_shift: params.ctx_shift,
    };
  }

  private bytesToMB(bytes: number): number {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return 0;
    }
    return Math.round((bytes / (1024 * 1024)) * 100) / 100;
  }

  private serializeError(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    if (typeof error === 'object' && error !== null) {
      try {
        return JSON.parse(JSON.stringify(error));
      } catch {
        return { value: String(error) };
      }
    }

    return { value: String(error) };
  }

  private async logInitMemory(stage: string, modelSize: number) {
    try {
      const memory = await this.checkMemoryRequirements();
      const availableMemory = Number(memory?.availableMemory ?? 0);
      const requiredMemory = Number(memory?.requiredMemory ?? 0);
      const modelMB = this.bytesToMB(modelSize);
      const availableMB = this.bytesToMB(availableMemory);
      const requiredMB = this.bytesToMB(requiredMemory);
      const modelToAvailableRatio = availableMemory > 0 ? Number((modelSize / availableMemory).toFixed(4)) : null;
      const requiredToAvailableRatio = availableMemory > 0 ? Number((requiredMemory / availableMemory).toFixed(4)) : null;

      console.log('init_model_memory', {
        stage,
        modelBytes: modelSize,
        modelMB,
        availableBytes: availableMemory,
        availableMB,
        requiredBytes: requiredMemory,
        requiredMB,
        modelToAvailableRatio,
        requiredToAvailableRatio,
      });
    } catch (error) {
      console.log('init_model_memory_failed', {
        stage,
        error: this.serializeError(error),
      });
    }
  }

  private async logInitFailure(stage: string, error: unknown, modelSize: number, initParams: Record<string, any>) {
    console.log('init_model_failure', {
      stage,
      error: this.serializeError(error),
      initParams,
    });
    await this.logInitMemory(stage, modelSize);
  }

  private isContextSpaceError(error: unknown): boolean {
    const payload = this.serializeError(error);
    const text = JSON.stringify(payload).toLowerCase();
    return text.includes('context_length_exceeded') ||
      text.includes('context is full');
  }

  private toTextOnlyContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const textParts = content
        .filter((part) => part?.type === 'text' && typeof part?.text === 'string')
        .map((part) => part.text);
      if (textParts.length > 0) {
        return textParts.join('\n');
      }
    }

    return '';
  }

  private compactMessagesForContext(messages: Array<{ role: string; content: any }>): Array<{ role: string; content: any }> {
    const systemMessages = messages.filter((message) => message.role === 'system');
    const nonSystemMessages = messages.filter((message) => message.role !== 'system');

    if (nonSystemMessages.length === 0) {
      return messages;
    }

    const latestUserIndex = nonSystemMessages.map((message) => message.role).lastIndexOf('user');
    if (latestUserIndex < 0) {
      return messages;
    }

    const latestUserMessage = nonSystemMessages[latestUserIndex];
    const previousAssistantMessage = latestUserIndex > 0 && nonSystemMessages[latestUserIndex - 1]?.role === 'assistant'
      ? nonSystemMessages[latestUserIndex - 1]
      : null;
    const previousUserMessage = latestUserIndex > 1 && nonSystemMessages[latestUserIndex - 2]?.role === 'user'
      ? nonSystemMessages[latestUserIndex - 2]
      : null;

    const compactMessages: Array<{ role: string; content: any }> = [...systemMessages];

    if (previousUserMessage && previousAssistantMessage) {
      compactMessages.push({
        role: previousUserMessage.role,
        content: this.toTextOnlyContent(previousUserMessage.content),
      });
      compactMessages.push({
        role: previousAssistantMessage.role,
        content: this.toTextOnlyContent(previousAssistantMessage.content),
      });
    }

    compactMessages.push(latestUserMessage);
    return compactMessages;
  }

  private minimalMessagesForContext(messages: Array<{ role: string; content: any }>): Array<{ role: string; content: any }> {
    const systemMessages = messages.filter((message) => message.role === 'system');
    const nonSystemMessages = messages.filter((message) => message.role !== 'system');
    if (nonSystemMessages.length === 0) {
      return systemMessages;
    }
    const latestUserIndex = nonSystemMessages.map((message) => message.role).lastIndexOf('user');
    const latestMessage = latestUserIndex >= 0 ? nonSystemMessages[latestUserIndex] : nonSystemMessages[nonSystemMessages.length - 1];
    return [...systemMessages, latestMessage];
  }

  constructor() {
    this.settingsManager.loadSettings().catch(error => {
    });
  }

  setInitOverrides(overrides: Partial<{
    n_ctx: number;
    n_batch: number;
    n_parallel: number;
    n_threads: number;
    n_gpu_layers: number;
  }>) {
    this.nextInitOverrides = { ...overrides };
  }

  clearInitOverrides() {
    this.nextInitOverrides = null;
  }

  async initializeModel(modelPath: string, mmProjectorPath?: string) {
    try {
      console.log('init_model_raw_path', { modelPath, mmProjectorPath });
      let finalModelPath = modelPath;
      
      if (finalModelPath.startsWith('file://')) {
        if (Platform.OS === 'ios') {
          finalModelPath = finalModelPath.replace('file://', '');
        } 
        else if (Platform.OS === 'android') {
          finalModelPath = finalModelPath.replace('file://', '');
        }
      }
      console.log('init_model_stripped_path', finalModelPath);

      try {
        const decodedPath = decodeURI(finalModelPath);
        console.log('init_model_decoded_path', decodedPath);
        finalModelPath = decodedPath;
      } catch (decodeError) {
        console.log('init_model_decode_failed', decodeError);
      }

      const fsPath = modelPath.startsWith('file://') || modelPath.startsWith('content://')
        ? modelPath
        : modelPath.startsWith('/')
          ? `file://${modelPath}`
          : modelPath;
      console.log('init_model_fs_path', fsPath);
      
      const modelInfo = await FileSystem.getInfoAsync(fsPath, { size: true });
      const modelSize = (modelInfo as any).size || 0;
      console.log('init_model_file_info', { exists: modelInfo.exists, size: modelSize });
      console.log('init_model_size_mb', this.bytesToMB(modelSize));
      
      if (!modelInfo.exists) {
        throw new Error('model_file_missing');
      }
      if (modelSize <= 0) {
        throw new Error('model_file_empty');
      }

      try {
        const nativeModelInfo = await loadLlamaModelInfo(finalModelPath);
        console.log('init_model_native_info', nativeModelInfo);
      } catch (error) {
        console.log('init_model_native_info_failed', this.serializeError(error));
      }

      await this.logInitMemory('pre_init', modelSize);

      const backendDevices = await getBackendDevicesInfo().catch((err) => {
        console.log('init_model_backend_query_failed', err);
        return [];
      });
      this.backendDevices = backendDevices;
      console.log('init_model_backend_devices', backendDevices);
      
      const hasGpuDevice = backendDevices.some((device) => {
        const type = device.type ? device.type.toLowerCase() : '';
        const backend = device.backend ? device.backend.toLowerCase() : '';
        return (
          type.includes('gpu') ||
          type.includes('igpu') ||
          backend.includes('metal') ||
          backend.includes('opencl') ||
          backend.includes('cuda')
        );
      });
      console.log('init_model_has_gpu', hasGpuDevice);

      if (this.context) {
        const contextToRelease = this.context;
        const wasMultimodal = this.multimodalService.isMultimodalInitialized();
        
        this.context = null;
        this.modelPath = null;
        this.multimodalService.clearMultimodalState();
        
        try {
          if (typeof contextToRelease.stopCompletion === 'function') {
            await withTimeout(contextToRelease.stopCompletion(), 2000).catch(() => {});
          }
        } catch {}
        
        await Promise.all([
          wasMultimodal ? withTimeout(
            this.multimodalService.releaseMultimodal(contextToRelease),
            3000
          ).catch(error => {
            console.error('mmproj_release_error', error);
          }) : Promise.resolve(),
          withTimeout(
            contextToRelease.release(),
            5000
          ).catch(error => {
            console.error('context_release_error', error);
          })
        ]).catch(() => {});
      }

      this.modelPath = finalModelPath;
      
      let gpuLayerCount = 0;
      try {
        const [gpuSettings, gpuSupport] = await Promise.all([
          gpuSettingsService.loadSettings(),
          checkGpuSupport().catch((): GpuSupport => ({ isSupported: false, reason: 'unknown' })),
        ]);
        console.log('init_model_gpu_settings', { gpuSettings, gpuSupport });
        gpuLayerCount =
          gpuSettings.enabled && gpuSupport.isSupported ? gpuSettings.layers : 0;
      } catch (error) {
        console.log('init_model_gpu_settings_failed', error);
        gpuLayerCount = 0;
      }

      if (!hasGpuDevice) {
        console.log('init_model_gpu_disabled_no_device');
        gpuLayerCount = 0;
      }

      const initOverrides = this.nextInitOverrides;
      this.nextInitOverrides = null;

      const effectiveGpuLayers = !hasGpuDevice
        ? 0
        : typeof initOverrides?.n_gpu_layers === 'number'
          ? Math.max(0, Math.round(initOverrides.n_gpu_layers))
          : gpuLayerCount;

      const initParams = {
        model: finalModelPath,
        ...LLAMA_INIT_CONFIG,
        use_mmap: this.resolveUseMmapValue(LLAMA_INIT_CONFIG.use_mmap),
        flash_attn_type: LLAMA_INIT_CONFIG.flash_attn_type as 'auto' | 'off' | 'on',
        cache_type_k: LLAMA_INIT_CONFIG.cache_type_k as 'f16' | 'f32' | 'q8_0' | 'q4_0' | 'q4_1' | 'iq4_nl' | 'q5_0' | 'q5_1',
        cache_type_v: LLAMA_INIT_CONFIG.cache_type_v as 'f16' | 'f32' | 'q8_0' | 'q4_0' | 'q4_1' | 'iq4_nl' | 'q5_0' | 'q5_1',
        ...(typeof initOverrides?.n_ctx === 'number' ? { n_ctx: Math.max(512, Math.round(initOverrides.n_ctx)) } : {}),
        ...(typeof initOverrides?.n_batch === 'number' ? { n_batch: Math.max(16, Math.round(initOverrides.n_batch)) } : {}),
        ...(typeof initOverrides?.n_parallel === 'number' ? { n_parallel: Math.max(1, Math.round(initOverrides.n_parallel)) } : {}),
        ...(typeof initOverrides?.n_threads === 'number' ? { n_threads: Math.max(1, Math.round(initOverrides.n_threads)) } : {}),
        n_gpu_layers: effectiveGpuLayers,
        no_extra_bufts: this.settingsManager.getNoExtraBuffers(),
      };
      console.log('init_model_params', JSON.stringify(initParams, null, 2));

      const compatParams = this.toCompatInitParams(initParams);
      let tempContext: Awaited<ReturnType<typeof initLlama>> | null = null;

      if (mmProjectorPath) {
        console.log('init_model_mmproj_preflight');
        await this.multimodalService.preflightProjector(mmProjectorPath);
      }

      try {
        console.log('init_model_calling_native');
        tempContext = await initLlama(initParams);
        console.log('init_model_native_success');
        await this.logInitMemory('native_success', modelSize);
      } catch (error) {
        console.log('init_model_native_failed', error);
        await this.logInitFailure('native_failed', error, modelSize, initParams);
        try {
          console.log('init_model_compat_fallback', JSON.stringify(compatParams, null, 2));
          tempContext = await initLlama(compatParams);
          console.log('init_model_compat_success');
          await this.logInitMemory('compat_success', modelSize);
        } catch (compatError) {
          console.log('init_model_compat_failed', compatError);
          await this.logInitFailure('compat_failed', compatError, modelSize, compatParams);
          if (Platform.OS === 'android') {
            const retryParams = {
              ...compatParams,
              n_gpu_layers: 0,
              use_mlock: false,
              use_mmap: false,
            };
            console.log('init_model_android_fallback', JSON.stringify(retryParams, null, 2));
            tempContext = await initLlama(retryParams);
            console.log('init_model_fallback_success');
            await this.logInitMemory('android_fallback_success', modelSize);
          } else {
            throw compatError;
          }
        }
      }

      if (mmProjectorPath && tempContext) {
        console.log('init_model_multimodal_start', mmProjectorPath);
        const success = await this.multimodalService.initMultimodal(tempContext, mmProjectorPath);
        console.log('init_model_multimodal_result', success);
        if (!success) {
          try {
            await withTimeout(tempContext.release(), 5000).catch(() => {});
          } catch {}
          tempContext = null;
          throw new Error('mmproj_init_failed');
        }
        const support = await tempContext.getMultimodalSupport();
        console.log('init_model_multimodal_support', support);
      }

      this.context = tempContext;
      this.isCancelled = false;
      console.log('init_model_complete');

      return this.context;
    } catch (error) {
      console.log('init_model_exception', error);
      await this.logInitFailure('final_exception', error, 0, {
        modelPath,
        mmProjectorPath,
      });
      this.emergencyCleanup();
      throw new Error(`model_init_failed: ${error}`);
    }
  }



  async loadSettings() {
    return this.settingsManager.loadSettings();
  }

  async saveSettings() {
    return this.settingsManager.saveSettings();
  }

  async resetSettings() {
    return this.settingsManager.resetSettings();
  }

  getSettings(): ModelSettings {
    return this.settingsManager.getSettings();
  }

  async updateSettings(newSettings: Partial<ModelSettings>) {
    return this.settingsManager.updateSettings(newSettings);
  }

  getMaxTokens(): number {
    return this.settingsManager.getMaxTokens();
  }

  async setMaxTokens(tokens: number) {
    return this.settingsManager.setMaxTokens(tokens);
  }

  getTemperature(): number {
    return this.settingsManager.getTemperature();
  }

  async setTemperature(temperature: number) {
    return this.settingsManager.setTemperature(temperature);
  }

  getSeed(): number {
    return this.settingsManager.getSeed();
  }

  async setSeed(seed: number) {
    return this.settingsManager.setSeed(seed);
  }

  getGrammar(): string {
    return this.settingsManager.getGrammar();
  }

  async setGrammar(grammar: string) {
    return this.settingsManager.setGrammar(grammar);
  }

  getNoExtraBuffers(): boolean {
    return this.settingsManager.getNoExtraBuffers();
  }

  async setNoExtraBuffers(enabled: boolean) {
    return this.settingsManager.setNoExtraBuffers(enabled);
  }

  getJinja(): boolean {
    return this.settingsManager.getJinja();
  }

  async setJinja(jinja: boolean) {
    return this.settingsManager.setJinja(jinja);
  }

  getEnableThinking(): boolean {
    return this.settingsManager.getEnableThinking();
  }

  async setEnableThinking(enableThinking: boolean) {
    return this.settingsManager.setEnableThinking(enableThinking);
  }

  getDryMultiplier(): number {
    return this.settingsManager.getDryMultiplier();
  }

  async setDryMultiplier(dryMultiplier: number) {
    return this.settingsManager.setDryMultiplier(dryMultiplier);
  }

  getMirostat(): number {
    return this.settingsManager.getMirostat();
  }

  async setMirostat(mirostat: number) {
    return this.settingsManager.setMirostat(mirostat);
  }

  async setMirostatParams(mirostat: number, tau: number, eta: number) {
    return this.settingsManager.setMirostatParams(mirostat, tau, eta);
  }

  async setPenaltyParams(repeat: number, freq: number, present: number, lastN: number) {
    return this.settingsManager.setPenaltyParams(repeat, freq, present, lastN);
  }

  async setDryParams(multiplier: number, base: number, allowedLength: number, penaltyLastN: number, sequenceBreakers: string[]) {
    return this.settingsManager.setDryParams(multiplier, base, allowedLength, penaltyLastN, sequenceBreakers);
  }

  async setLogitBias(logitBias: Array<Array<number>>) {
    return this.settingsManager.setLogitBias(logitBias);
  }



  async generateResponse(
    messages: Array<{ role: string; content: string }>,
    onToken?: (token: string) => boolean | void,
    customSettings?: Partial<ModelSettings>
  ) {
    if (!this.context) {
      throw new Error('Model not initialized');
    }

    await this.acquireGenLock();
    console.log('gen_response_start', { msgCount: messages.length });

    let fullResponse = '';
    this.isCancelled = false;
    this.tokenProcessingService.setCancelled(false);
    const settings = this.resolveSettings(customSettings);
    const stop = [...(settings.stopWords || [])];
    console.log('gen_stop_words', { stopLen: stop.length });

    try {
      const processedMessages = await Promise.all(
        messages.map(async (msg) => {
          const processed = this.multimodalService.parseMultimodalMessage(msg.content);
          const hasMedia = processed.images?.length || processed.audioFiles?.length;
          
          if (this.multimodalService.isMultimodalInitialized() && hasMedia) {
            try {
              const content = await this.multimodalService.createMultimodalContent(processed);
              
              if (content.length === 0) {
                return {
                  role: msg.role,
                  content: processed.text,
                };
              }
              
              return {
                role: msg.role,
                content: content,
              };
            } catch {
              return {
                role: msg.role,
                content: processed.text,
              };
            }
          } else {
            return {
              role: msg.role,
              content: processed.text,
            };
          }
        })
      );

      const mediaStats = processedMessages.map((message, index) => {
        if (!Array.isArray(message.content)) {
          return { index, role: message.role, media: 0 };
        }
        const mediaCount = message.content.filter((item: any) => item.type === 'image_url' || item.type === 'input_audio').length;
        return { index, role: message.role, media: mediaCount };
      });
      const totalMedia = mediaStats.reduce((sum, item) => sum + item.media, 0);

      let tokenCount = 0;

      const baseCompletionParams = {
        messages: processedMessages,
        n_predict: settings.maxTokens,
        stop,
        temperature: settings.temperature,
        top_k: settings.topK,
        top_p: settings.topP,
        min_p: settings.minP,
        jinja: settings.jinja,
        grammar: settings.grammar || undefined,
        n_probs: settings.nProbs,
        penalty_last_n: settings.penaltyLastN,
        penalty_repeat: settings.penaltyRepeat,
        penalty_freq: settings.penaltyFreq,
        penalty_present: settings.penaltyPresent,
        mirostat: settings.mirostat,
        mirostat_tau: settings.mirostatTau,
        mirostat_eta: settings.mirostatEta,
        dry_multiplier: settings.dryMultiplier,
        dry_base: settings.dryBase,
        dry_allowed_length: settings.dryAllowedLength,
        dry_penalty_last_n: settings.dryPenaltyLastN,
        dry_sequence_breakers: settings.drySequenceBreakers,
        ignore_eos: settings.ignoreEos,
        ...(settings.logitBias?.length ? { logit_bias: settings.logitBias } : {}),
        seed: settings.seed,
        xtc_probability: settings.xtcProbability,
        xtc_threshold: settings.xtcThreshold,
        typical_p: settings.typicalP,
        enable_thinking: settings.enableThinking,
      };

      const runCompletion = async (messagesForCompletion: Array<{ role: string; content: any }>, stage: 'primary' | 'compact-retry' | 'minimal-retry') => {
        console.log('gen_completion_start', stage);
        fullResponse = '';
        tokenCount = 0;
        this.tokenProcessingService.clearTokenQueue();

        const completionParams = {
          ...baseCompletionParams,
          messages: messagesForCompletion,
        };

        const result = await this.context!.completion(
          completionParams,
          (data) => {
            if (this.isCancelled) {
              return false;
            }

            this.tokenProcessingService.queueToken(data.token);
            fullResponse += data.token;
            tokenCount += 1;

            void this.tokenProcessingService.startTokenProcessing(onToken);

            if (this.tokenProcessingService.isCancelling()) {
              this.isCancelled = true;
              return false;
            }

            return !this.isCancelled;
          }
        );

        if (result.context_full) {
          throw new Error('CONTEXT_LENGTH_EXCEEDED');
        }
      };

      try {
        await runCompletion(processedMessages, 'primary');
      } catch (error) {
        if (!this.isContextSpaceError(error)) {
          throw error;
        }

        const compactMessages = this.compactMessagesForContext(processedMessages);
        console.log('gen_response_context_retry', {
          reason: 'not_enough_context_space',
          originalCount: processedMessages.length,
          compactCount: compactMessages.length,
        });

        try {
          await runCompletion(compactMessages, 'compact-retry');
        } catch (compactError) {
          if (!this.isContextSpaceError(compactError)) {
            throw compactError;
          }

          const minimalMessages = this.minimalMessagesForContext(processedMessages);
          console.log('gen_response_context_retry_minimal', {
            compactCount: compactMessages.length,
            minimalCount: minimalMessages.length,
          });

          try {
            await runCompletion(minimalMessages, 'minimal-retry');
          } catch (minimalError) {
            if (this.isContextSpaceError(minimalError)) {
              throw new Error('CONTEXT_LENGTH_EXCEEDED');
            }
            throw minimalError;
          }
        }
      }

      console.log('gen_response_completion_done', { tokenCount, responseLength: fullResponse.length });

      await this.tokenProcessingService.startTokenProcessing(onToken);
      await this.tokenProcessingService.waitForTokenQueueCompletion();

      return fullResponse.trim();
    } catch (error) {
      console.log('gen_response_error', {
        error: this.serializeError(error),
      });
      throw error;
    } finally {
      this.tokenProcessingService.clearTokenQueue();
      this.isCancelled = false;
      this.releaseGenLock();
    }
  }

  async generateChatTitle(userMessage: string): Promise<string> {
    if (!this.context) {
      throw new Error('Model not initialized');
    }

    if (this.isGenBusy()) {
      console.log('title_skip_busy');
      throw new Error('MODEL_BUSY');
    }
    await this.acquireGenLock(0);

    const titlePrompt = [
      {
        role: 'system',
        content: 'Create a 3-6 word title for this conversation. Respond with only the title, no quotes.'
      },
      {
        role: 'user',
        content: `Title for: "${userMessage.slice(0, 100)}"`
      }
    ];

    const settings = this.resolveSettings();

    try {
      let fullResponse = '';
      this.isCancelled = false;
      console.log('title_gen_start');

      await this.context.completion(
        {
          messages: titlePrompt,
          n_predict: TITLE_GENERATION_CONFIG.maxTokens,
          stop: [...(settings.stopWords || []), '\n', '\\n'],
          temperature: TITLE_GENERATION_CONFIG.temperature,
          top_k: TITLE_GENERATION_CONFIG.topK,
          top_p: TITLE_GENERATION_CONFIG.topP,
          min_p: TITLE_GENERATION_CONFIG.minP,
          jinja: settings.jinja,
          n_probs: 0,
          penalty_repeat: 1.0,
          penalty_freq: 0,
          penalty_present: 0,
          ignore_eos: false,
          seed: settings.seed,
          enable_thinking: false,
        },
        (data) => {
          if (this.isCancelled) {
            return false;
          }
          
          if (!settings.stopWords.includes(data.token) && data.token !== '\n' && data.token !== '\\n') {
            fullResponse += data.token;
            return true;
          }
          return false;
        }
      );

      const title = fullResponse
        .trim()
        .replace(/['"]/g, '')
        .replace(/<\/?think[^>]*>/g, '')
        .replace(/<\|channel>thought/gi, '')
        .replace(/<channel\|>/gi, '')
        .trim()
        .substring(0, TITLE_GENERATION_CONFIG.maxTitleLength);
      console.log('title_gen_result', { title: title || 'empty', rawLen: fullResponse.length });
      if (title) {
        return title;
      }
      
      throw new Error('empty_title');
    } catch (error) {
      console.log('title_gen_error', error instanceof Error ? error.message : 'unknown');
      throw error;
    } finally {
      this.isCancelled = false;
      this.releaseGenLock();
    }
  }

  async benchmark(prompt: string, customSettings?: Partial<ModelSettings>): Promise<BenchmarkSample> {
    if (!this.context) {
      throw new Error('Model not initialized');
    }

    await this.acquireGenLock();

    const settings = this.resolveSettings(customSettings);
    const stop = [...(settings.stopWords || [])];
    console.log('bench_stop_words', { stopLen: stop.length });
    const messages = settings.systemPrompt
      ? [
          { role: 'system', content: settings.systemPrompt },
          { role: 'user', content: prompt },
        ]
      : [{ role: 'user', content: prompt }];

    try {
      const result = await this.context.completion({
        messages,
        n_predict: settings.maxTokens,
        stop,
        temperature: settings.temperature,
        top_k: settings.topK,
        top_p: settings.topP,
        min_p: settings.minP,
        jinja: settings.jinja,
        grammar: settings.grammar || undefined,
        n_probs: settings.nProbs,
        penalty_last_n: settings.penaltyLastN,
        penalty_repeat: settings.penaltyRepeat,
        penalty_freq: settings.penaltyFreq,
        penalty_present: settings.penaltyPresent,
        mirostat: settings.mirostat,
        mirostat_tau: settings.mirostatTau,
        mirostat_eta: settings.mirostatEta,
        dry_multiplier: settings.dryMultiplier,
        dry_base: settings.dryBase,
        dry_allowed_length: settings.dryAllowedLength,
        dry_penalty_last_n: settings.dryPenaltyLastN,
        dry_sequence_breakers: settings.drySequenceBreakers,
        ignore_eos: settings.ignoreEos,
        ...(settings.logitBias?.length ? { logit_bias: settings.logitBias } : {}),
        seed: settings.seed,
        xtc_probability: settings.xtcProbability,
        xtc_threshold: settings.xtcThreshold,
        typical_p: settings.typicalP,
        enable_thinking: settings.enableThinking,
      });

      if (result.context_full) {
        throw new Error('CONTEXT_LENGTH_EXCEEDED');
      }

      return {
        promptTokens: result.timings.prompt_n,
        completionTokens: result.timings.predicted_n,
        totalTokens: result.timings.prompt_n + result.timings.predicted_n,
        ttftMs: result.timings.prompt_ms,
        totalTimeMs: result.timings.prompt_ms + result.timings.predicted_ms,
        prefillTokensPerSecond: result.timings.prompt_per_second,
        decodeTokensPerSecond: result.timings.predicted_per_second,
      };
    } finally {
      this.releaseGenLock();
    }
  }

  async stopCompletion() {
    this.isCancelled = true;
    this.tokenProcessingService.setCancelled(true);
    
    if (this.context) {
      try {
        if (typeof this.context.stopCompletion === 'function') {
          await this.context.stopCompletion();
        }
      } catch (error) {
      }
    }

    await this.tokenProcessingService.waitForTokenQueueCompletion();
  }

  async cancelGeneration() {
    this.isCancelled = true;
    
    await this.stopCompletion();
    
    this.tokenProcessingService.clearTokenQueue();
    
    if (this.modelPath && this.context) {
      try {
        const currentModelPath = this.modelPath;
        const currentMmProjectorPath = this.multimodalService.getMultimodalProjectorPath();
        const contextToRelease = this.context;
        const wasMultimodal = this.multimodalService.isMultimodalInitialized();
        
        this.context = null;
        this.multimodalService.clearMultimodalState();
        
        try {
          if (typeof contextToRelease.stopCompletion === 'function') {
            await withTimeout(contextToRelease.stopCompletion(), 2000).catch(() => {});
          }
        } catch {}
        
        await Promise.all([
          wasMultimodal ? withTimeout(
            this.multimodalService.releaseMultimodal(contextToRelease),
            3000
          ).catch(error => {
            console.error('mmproj_release_on_cancel_error', error);
          }) : Promise.resolve(),
          withTimeout(
            contextToRelease.release(),
            5000
          ).catch(error => {
            console.error('context_release_on_cancel_error', error);
          })
        ]).catch(() => {});
        
        const resetInitParams = this.toCompatInitParams({
          model: currentModelPath,
          ...LLAMA_INIT_CONFIG,
        });
        let tempContext = await initLlama(resetInitParams);

        if (currentMmProjectorPath) {
          console.log('cancel_mmproj_reattach');
          const success = await this.multimodalService.initMultimodal(tempContext, currentMmProjectorPath);
          if (!success) {
            await withTimeout(tempContext.release(), 5000).catch(() => {});
            throw new Error('mmproj_init_failed');
          }
        }
        this.context = tempContext;
        
      } catch (error) {
        this.context = null;
      }
    }
  }

  async release() {
    if (!this.context) {
      return;
    }

    const contextToRelease = this.context;
    const wasMultimodalEnabled = this.multimodalService.isMultimodalInitialized();
    
    this.context = null;
    this.modelPath = null;
    this.isCancelled = true;
    this.tokenProcessingService.clearTokenQueue();
    this.multimodalService.clearMultimodalState();
    
    try {
      if (typeof contextToRelease.stopCompletion === 'function') {
        await withTimeout(contextToRelease.stopCompletion(), 2000).catch(() => {});
      }
    } catch {}
    
    const releasePromises: Promise<void>[] = [];
    
    if (wasMultimodalEnabled) {
      releasePromises.push(
        withTimeout(
          this.multimodalService.releaseMultimodal(contextToRelease),
          3000
        ).catch(multimodalError => {
          console.error('mmproj_release_error', multimodalError);
        })
      );
    }
    
    releasePromises.push(
      withTimeout(
        contextToRelease.release(),
        7000
      ).catch(contextError => {
        console.error('context_release_error', contextError);
      })
    );
    
    await Promise.all(releasePromises).catch(() => {});
    withTimeout(releaseAllLlama(), 3000).catch(() => {});
  }

  emergencyCleanup() {
    this.isCancelled = true;
    this.tokenProcessingService.clearTokenQueue();
    this.multimodalService.clearMultimodalState();
    this.context = null;
    this.modelPath = null;
    this.isUnloading = false;
  }

  getModelPath() {
    return this.modelPath;
  }

  getMultimodalProjectorPath() {
    return this.multimodalService.getMultimodalProjectorPath();
  }

  isMultimodalInitialized(): boolean {
    return this.multimodalService.isMultimodalInitialized();
  }

  getMultimodalSupport(): MultimodalSupport {
    return this.multimodalService.getMultimodalSupport();
  }

  async releaseMultimodal(): Promise<void> {
    if (this.context) {
      const contextToRelease = this.context;
      this.multimodalService.releaseMultimodal(contextToRelease).catch(error => {
        console.error('mmproj_manual_release_error', error);
      });
    }
  }

  hasVisionSupport(): boolean {
    return this.multimodalService.hasVisionSupport();
  }

  hasAudioSupport(): boolean {
    return this.multimodalService.hasAudioSupport();
  }

  async generateEmbedding(text: string, params?: EmbeddingParams): Promise<number[]> {
    if (!this.context) {
      throw new Error('Model not initialized');
    }

    const result = await this.context.embedding(text, params);
    return result.embedding;
  }

  async tokenizeWithMedia(text: string, mediaPaths: string[] = []): Promise<any> {
    if (!this.context) {
      throw new Error('Model not initialized');
    }

    try {
      const result = await this.context.tokenize(text, {
        media_paths: mediaPaths
      });

      return result;
    } catch (error) {
      throw error;
    }
  }

  async checkMemoryRequirements(): Promise<ModelMemoryInfo> {
    try {
      if (!LlamaManagerModule?.getMemoryInfo) {
        return {
          requiredMemory: 0,
          availableMemory: 0
        };
      }
      return await LlamaManagerModule.getMemoryInfo();
    } catch (error) {
      return {
        requiredMemory: 0,
        availableMemory: 0
      };
    }
  }

  isInitialized(): boolean {
    return this.context !== null;
  }

  isGenerating(): boolean {
    return !this.isCancelled && this.context !== null;
  }

  isCancelling(): boolean {
    return this.isCancelled;
  }

  async loadModel(modelPath: string, mmProjectorPath?: string) {
    try {
      console.log('model_load_start', modelPath);
      
      this.isCancelled = true;
      this.tokenProcessingService.clearTokenQueue();
      
      const releaseTimeoutMs = this.multimodalService.isMultimodalInitialized() ? 12000 : 8000;
      await withTimeout(this.release(), releaseTimeoutMs).catch(error => {
        console.error('model_release_timeout', error);
        this.emergencyCleanup();
      });
      
      console.log('model_load_init');
      await this.initializeModel(modelPath, mmProjectorPath);
      console.log('model_load_success');
      this.events.emit('model-loaded', modelPath);
      return true;
    } catch (error) {
      console.error('model_load_failed', error);
      throw error;
    }
  }

  async unloadModel() {
    if (this.isUnloading) {
      throw new Error('model_unload_in_progress');
    }

    this.isUnloading = true;
    
    try {
      const releaseTimeoutMs = this.multimodalService.isMultimodalInitialized() ? 12000 : 8000;
      await withTimeout(this.release(), releaseTimeoutMs);
    } catch (error) {
      console.error('model_release_error', error);
      this.emergencyCleanup();
    } finally {
      this.events.emit('model-unloaded');
      this.isUnloading = false;
    }
  }

  addListener(event: keyof LlamaManagerEvents, listener: any): () => void {
    this.events.on(event, listener);
    return () => this.events.off(event, listener);
  }

  removeListener(event: keyof LlamaManagerEvents, listener: any): void {
    this.events.off(event, listener);
  }
}

export const llamaManager = new LlamaManager(); 
