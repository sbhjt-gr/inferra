import { initLlama, loadLlamaModelInfo, type LlamaContext } from 'llama.rn';
import { Platform, NativeModules } from 'react-native';
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
import { LLAMA_INIT_CONFIG, TITLE_GENERATION_CONFIG } from '../config/llamaConfig';

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
  private events = new EventEmitter<LlamaManagerEvents>();
  private isCancelled: boolean = false;
  private isUnloading: boolean = false;
  
  private multimodalService = new MultimodalService();
  private tokenProcessingService = new TokenProcessingService();
  private settingsManager = new LlamaSettingsManager();

  constructor() {
    this.settingsManager.loadSettings().catch(error => {
    });
  }

  async initializeModel(modelPath: string, mmProjectorPath?: string) {
    try {
      let finalModelPath = modelPath;
      
      if (finalModelPath.startsWith('file://')) {
        if (Platform.OS === 'ios') {
          finalModelPath = finalModelPath.replace('file://', '');
        } 
        else if (Platform.OS === 'android') {
          finalModelPath = finalModelPath.replace('file://', '');
        }
      }

      const modelInfo = await loadLlamaModelInfo(finalModelPath);

      if (this.context) {
        await this.multimodalService.releaseMultimodal(this.context);
        this.context = null;
      }

      this.modelPath = finalModelPath;
      
      this.context = await initLlama({
        model: finalModelPath,
        ...LLAMA_INIT_CONFIG,
      });

      if (mmProjectorPath && this.context) {
        const success = await this.multimodalService.initMultimodal(this.context, mmProjectorPath);
        
        if (success) {
          const support = await this.context.getMultimodalSupport();
        }
      }

      return this.context;
    } catch (error) {
      throw new Error(`Failed to initialize model: ${error}`);
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
    customSettings?: ModelSettings
  ) {
    if (!this.context) {
      throw new Error('Model not initialized');
    }

    let fullResponse = '';
    this.isCancelled = false;
    this.tokenProcessingService.setCancelled(false);
    
    const settings = customSettings || this.settingsManager.getSettings();

    try {
      const processedMessages = await Promise.all(
        messages.map(async (msg) => {
          const processed = this.multimodalService.parseMultimodalMessage(msg.content);
          
          if (this.multimodalService.isMultimodalInitialized() && (processed.images?.length || processed.audioFiles?.length)) {
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
            } catch (error) {
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

      const result = await this.context.completion(
        {
          messages: processedMessages,
          n_predict: settings.maxTokens,
          stop: settings.stopWords,
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
          logit_bias: settings.logitBias.length > 0 ? settings.logitBias : undefined,
          seed: settings.seed,
          xtc_probability: settings.xtcProbability,
          xtc_threshold: settings.xtcThreshold,
          typical_p: settings.typicalP,
          enable_thinking: settings.enableThinking,
        },
        (data) => {
          if (this.isCancelled) {
            return false;
          }
          
          if (!settings.stopWords.includes(data.token)) {
            fullResponse += data.token;
            
            this.tokenProcessingService.queueToken(data.token);
            
            this.tokenProcessingService.startTokenProcessing(onToken);
            
            return !this.isCancelled;
          }
          return false;
        }
      );

      await this.tokenProcessingService.waitForTokenQueueCompletion();

      return fullResponse.trim();
    } catch (error) {
      throw error;
    } finally {
      this.tokenProcessingService.clearTokenQueue();
      this.isCancelled = false;
    }
  }

  async generateChatTitle(userMessage: string): Promise<string> {
    if (!this.context) {
      throw new Error('Model not initialized');
    }

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

    const settings = this.settingsManager.getSettings();

    try {
      let fullResponse = '';
      this.isCancelled = false;

      await this.context.completion(
        {
          messages: titlePrompt,
          n_predict: TITLE_GENERATION_CONFIG.maxTokens,
          stop: [...settings.stopWords, '\n', '\\n'],
          temperature: TITLE_GENERATION_CONFIG.temperature,
          top_k: TITLE_GENERATION_CONFIG.topK,
          top_p: TITLE_GENERATION_CONFIG.topP,
          min_p: TITLE_GENERATION_CONFIG.minP,
          jinja: settings.jinja,
          grammar: settings.grammar || undefined,
          n_probs: 0,
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
          ignore_eos: false,
          logit_bias: settings.logitBias.length > 0 ? settings.logitBias : undefined,
          seed: settings.seed,
          xtc_probability: settings.xtcProbability,
          xtc_threshold: settings.xtcThreshold,
          typical_p: settings.typicalP,
          enable_thinking: settings.enableThinking,
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

      const title = fullResponse.trim().replace(/['"]/g, '').substring(0, TITLE_GENERATION_CONFIG.maxTitleLength);
      if (title) {
        return title;
      }
      
      const now = new Date();
      const dateStr = now.toLocaleDateString();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `Chat ${dateStr} ${timeStr}`;
    } catch (error) {
      const now = new Date();
      const dateStr = now.toLocaleDateString();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `Chat ${dateStr} ${timeStr}`;
    } finally {
      this.isCancelled = false;
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
        
        await this.multimodalService.releaseMultimodal(this.context);
        this.context = null;
        
        this.context = await initLlama({
          model: currentModelPath,
          ...LLAMA_INIT_CONFIG,
        });

        if (currentMmProjectorPath) {
          await this.multimodalService.initMultimodal(this.context, currentMmProjectorPath);
        }
        
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
    
    try {
      this.isCancelled = true;
      this.tokenProcessingService.clearTokenQueue();
      
      if (wasMultimodalEnabled) {
        try {
          await withTimeout(this.multimodalService.releaseMultimodal(contextToRelease), 10000);
        } catch (multimodalError) {
          console.error('Error releasing multimodal context:', multimodalError);
        }
      }
      
    } catch (error) {
      console.error('Error during context release:', error);
    } finally {
      this.context = null;
      this.modelPath = null;
    }
  }

  emergencyCleanup() {
    this.isCancelled = true;
    this.tokenProcessingService.clearTokenQueue();
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
    try {
      if (this.context) {
        await withTimeout(this.multimodalService.releaseMultimodal(this.context), 8000);
      }
    } catch (error) {
      console.error('Error releasing multimodal context:', error);
    }
  }

  hasVisionSupport(): boolean {
    return this.multimodalService.hasVisionSupport();
  }

  hasAudioSupport(): boolean {
    return this.multimodalService.hasAudioSupport();
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
      console.log(`[LlamaManager] Starting model load: ${modelPath}`);
      await this.release();
      console.log(`[LlamaManager] Released previous model, initializing new one`);
      await this.initializeModel(modelPath, mmProjectorPath);
      console.log(`[LlamaManager] Model initialized successfully`);
      this.events.emit('model-loaded', modelPath);
      return true;
    } catch (error) {
      console.error(`[LlamaManager] Model load failed:`, error);
      throw error;
    }
  }

  async unloadModel() {
    if (this.isUnloading) {
      throw new Error('Model unload already in progress');
    }

    this.isUnloading = true;
    try {
      await this.release();
    } catch (error) {
      console.error('Error during model release:', error);
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
