import { initLlama, loadLlamaModelInfo, type LlamaContext } from 'llama.rn';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EventEmitter from 'eventemitter3';
import * as FileSystem from 'expo-file-system';

interface ModelMemoryInfo {
  requiredMemory: number;
  availableMemory: number;
}

interface TokenQueueItem {
  token: string;
  timestamp: number;
}

interface LlamaManagerInterface {
  getMemoryInfo(): Promise<ModelMemoryInfo>;
}

interface ModelSettings {
  maxTokens: number;
  temperature: number;
  topK: number;
  topP: number;
  minP: number;
  stopWords: string[];
  systemPrompt: string;
  jinja: boolean;
  grammar: string;
  nProbs: number;
  penaltyLastN: number;
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
  ignoreEos: boolean;
  logitBias: Array<Array<number>>;
  seed: number;
  xtcProbability: number;
  xtcThreshold: number;
  typicalP: number;
  enableThinking: boolean;
}

interface LlamaManagerEvents {
  'model-loaded': (modelPath: string | null) => void;
  'model-unloaded': () => void;
}

interface MultimodalContent {
  type: 'text' | 'image_url' | 'input_audio';
  text?: string;
  image_url?: {
    url?: string;
  };
  input_audio?: {
    format: 'wav' | 'mp3' | 'm4a';
    url?: string;
  };
}

interface MultimodalMessage {
  role: string;
  content: string | MultimodalContent[];
}

interface ProcessedMessage {
  text: string;
  images?: string[];
  audioFiles?: string[];
}

interface MultimodalSupport {
  vision: boolean;
  audio: boolean;
}

const DEFAULT_SETTINGS: ModelSettings = {
  maxTokens: 1200,
  temperature: 0.7,
  topK: 40,
  topP: 0.9,
  minP: 0.05,
  stopWords: ['<|end|>', '<end_of_turn>', '<|im_end|>', '<|endoftext|>', '<end_of_utterance>'],
  systemPrompt: 'You are a helpful, honest, and safe AI assistant. Do not produce harmful, misleading, or offensive content. If asked for actions or information that may be illegal, unethical, dangerous, or violate privacy, refuse clearly. Maintain a neutral and professional tone, avoid personal opinions unless explicitly requested.',
  jinja: true,
  grammar: '',
  nProbs: 0,
  penaltyLastN: 64,
  penaltyRepeat: 1.0,
  penaltyFreq: 0.0,
  penaltyPresent: 0.0,
  mirostat: 2,
  mirostatTau: 5.0,
  mirostatEta: 0.1,
  dryMultiplier: 0.0,
  dryBase: 1.75,
  dryAllowedLength: 2,
  dryPenaltyLastN: -1,
  drySequenceBreakers: ['\n', ':', '"', '*'],
  ignoreEos: false,
  logitBias: [],
  seed: -1,
  xtcProbability: 0.0,
  xtcThreshold: 0.1,
  typicalP: 1.0,
  enableThinking: true,
};

const LlamaManagerModule = NativeModules.LlamaManager as LlamaManagerInterface;

class LlamaManager {
  private context: LlamaContext | null = null;
  private modelPath: string | null = null;
  private settings: ModelSettings = { ...DEFAULT_SETTINGS };
  private events = new EventEmitter<LlamaManagerEvents>();
  private isCancelled: boolean = false;
  private isMultimodalEnabled: boolean = false;
  private mmProjectorPath: string | null = null;
  private multimodalSupport: MultimodalSupport = { vision: false, audio: false };
  
  private tokenQueue: TokenQueueItem[] = [];
  private isProcessingTokens: boolean = false;
  private tokenProcessingPromise: Promise<void> | null = null;

  constructor() {
    this.loadSettings().catch(error => {
      console.error('Error loading settings:', error);
    });
  }

  async initializeModel(modelPath: string, mmProjectorPath?: string) {
    try {
      console.log('[LlamaManager] Initializing model from path:', modelPath);

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
        await this.releaseMultimodal();
        await this.context.release();
        this.context = null;
      }

      this.modelPath = finalModelPath;
      this.mmProjectorPath = mmProjectorPath || null;
      
      this.context = await initLlama({
        model: finalModelPath,
        use_mlock: true,
        n_ctx: 6144,
        n_batch: 512,
        n_threads: Platform.OS === 'ios' ? 6 : 4,
        n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
        embedding: false,
        rope_freq_base: 10000,
        rope_freq_scale: 1,
        ctx_shift: false,
      });

      if (mmProjectorPath && this.context) {
        console.log('[LlamaManager] Initializing multimodal capabilities with projector:', mmProjectorPath);
        const success = await this.initMultimodal(mmProjectorPath);
        
        if (success) {
          console.log('[LlamaManager] Multimodal support initialized successfully!');
          
          const support = await this.context.getMultimodalSupport();
          console.log('[LlamaManager] Vision support:', support.vision);
          console.log('[LlamaManager] Audio support:', support.audio);
        } else {
          console.log('[LlamaManager] Failed to initialize multimodal support');
        }
      }

      return this.context;
    } catch (error) {
      throw new Error(`Failed to initialize model: ${error}`);
    }
  }

  async initMultimodal(mmProjectorPath: string): Promise<boolean> {
    try {
      if (!this.context) {
        throw new Error('Base model context must be initialized before multimodal');
      }

      console.log('[LlamaManager] Initializing multimodal with projector:', mmProjectorPath);

      let finalProjectorPath = mmProjectorPath;
      if (finalProjectorPath.startsWith('file://')) {
        finalProjectorPath = finalProjectorPath.slice(7);
      }

      console.log('[LlamaManager] Attempting to initialize multimodal with path:', finalProjectorPath);

      const success = await this.context.initMultimodal({
        path: finalProjectorPath,
        use_gpu: Platform.OS === 'ios' ? true : false,
      });

      if (success) {
        try {
          this.isMultimodalEnabled = await this.context.isMultimodalEnabled();
          this.multimodalSupport = await this.context.getMultimodalSupport();
          this.mmProjectorPath = finalProjectorPath;
          
          console.log('[LlamaManager] Multimodal initialization successful');
          console.log('[LlamaManager] Vision support:', this.multimodalSupport.vision);
          console.log('[LlamaManager] Audio support:', this.multimodalSupport.audio);
        } catch (statusError) {
          console.error('[LlamaManager] Error checking multimodal status:', statusError);
          this.isMultimodalEnabled = false;
          this.multimodalSupport = { vision: false, audio: false };
          return false;
        }
      } else {
        this.isMultimodalEnabled = false;
        this.multimodalSupport = { vision: false, audio: false };
        console.error('[LlamaManager] Failed to initialize multimodal support');
      }

      return success;
    } catch (error) {
      console.error('[LlamaManager] Multimodal initialization failed:', error);
      this.isMultimodalEnabled = false;
      this.multimodalSupport = { vision: false, audio: false };
      
      return false;
    }
  }

  async releaseMultimodal(): Promise<void> {
    try {
      if (this.context && this.isMultimodalEnabled) {
        await this.context.releaseMultimodal();
        this.isMultimodalEnabled = false;
        this.multimodalSupport = { vision: false, audio: false };
        console.log('[LlamaManager] Multimodal context released');
      }
    } catch (error) {
      console.error('[LlamaManager] Error releasing multimodal context:', error);
    }
  }

  private parseMultimodalMessage(message: string): ProcessedMessage {
    try {
      const parsed = JSON.parse(message);
      
      if (parsed.type === 'multimodal' && parsed.content && Array.isArray(parsed.content)) {
        const result: ProcessedMessage = { text: '', images: [], audioFiles: [] };
        
        for (const item of parsed.content) {
          if (item.type === 'text') {
            result.text = item.text || '';
          } else if (item.type === 'image' && item.uri) {
            result.images = result.images || [];
            result.images.push(item.uri);
          } else if (item.type === 'audio' && item.uri) {
            result.audioFiles = result.audioFiles || [];
            result.audioFiles.push(item.uri);
          }
        }
        
        return result;
      }
      
      if (parsed.type === 'photo_upload') {
        const imageUri = this.extractImageUri(parsed.internalInstruction);
        return {
          text: parsed.userContent || 'What do you see in this image?',
          images: imageUri ? [imageUri] : [],
        };
      } else if (parsed.type === 'file_upload') {
        return {
          text: parsed.internalInstruction + '\n\n' + (parsed.userContent || ''),
        };
      } else if (parsed.type === 'audio_upload') {
        const audioUri = this.extractAudioUri(parsed.internalInstruction);
        return {
          text: parsed.userContent || 'Transcribe or describe this audio:',
          audioFiles: audioUri ? [audioUri] : [],
        };
      }
    } catch (error) {
    }

    return { text: message };
  }

  private extractImageUri(instruction: string): string | null {
    const uriMatch = instruction.match(/Photo URI:\s*(.+)/);
    return uriMatch ? uriMatch[1].trim() : null;
  }

  private extractAudioUri(instruction: string): string | null {
    const uriMatch = instruction.match(/Audio URI:\s*(.+)/);
    return uriMatch ? uriMatch[1].trim() : null;
  }

  private async convertFileToBase64(fileUri: string): Promise<string | null> {
    try {
      const fileContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return fileContent;
    } catch (error) {
      console.error('[LlamaManager] Error converting file to base64:', error);
      return null;
    }
  }

  private getFileExtension(filePath: string): string {
    return filePath.split('.').pop()?.toLowerCase() || '';
  }

  private getMimeType(extension: string): string {
    const mimeTypes: { [key: string]: string } = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'wav': 'audio/wav',
      'mp3': 'audio/mp3',
      'm4a': 'audio/mp4',
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  private async createMultimodalContent(processed: ProcessedMessage): Promise<MultimodalContent[]> {
    const content: MultimodalContent[] = [];

    content.push({
      type: 'text',
      text: processed.text,
    });

    if (processed.images && processed.images.length > 0 && this.multimodalSupport.vision) {
      for (const imageUri of processed.images) {
        try {
          let cleanPath = imageUri;
          if (cleanPath.startsWith('file://')) {
            cleanPath = cleanPath.slice(7);
          }
          
          console.log('[LlamaManager] Processing image with path:', cleanPath);
          
          content.push({
            type: 'image_url',
            image_url: {
              url: cleanPath,
            },
          });
        } catch (error) {
          console.error('[LlamaManager] Error processing image:', error);
        }
      }
    }

    if (processed.audioFiles && processed.audioFiles.length > 0 && this.multimodalSupport.audio) {
      for (const audioUri of processed.audioFiles) {
        try {
          let cleanPath = audioUri;
          if (cleanPath.startsWith('file://')) {
            cleanPath = cleanPath.slice(7);
          }
          
          console.log('[LlamaManager] Processing audio with path:', cleanPath);
          const extension = this.getFileExtension(audioUri);
          
          const validFormats: ('wav' | 'mp3' | 'm4a')[] = ['wav', 'mp3', 'm4a'];
          const format = validFormats.includes(extension as any) ? extension as 'wav' | 'mp3' | 'm4a' : 'm4a';
          
          content.push({
            type: 'input_audio',
            input_audio: {
              url: cleanPath,
              format: format,
            },
          });
        } catch (error) {
          console.error('[LlamaManager] Error processing audio:', error);
        }
      }
    }

    console.log('[LlamaManager] Created multimodal content:', JSON.stringify(content, null, 2));
    return content;
  }

  async loadSettings() {
    try {
      const savedSettings = await AsyncStorage.getItem('@model_settings');
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...parsedSettings
        };
      } else {
        this.settings = { ...DEFAULT_SETTINGS };
        await this.saveSettings();
      }
    } catch (error) {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings() {
    try {
      await AsyncStorage.setItem('@model_settings', JSON.stringify(this.settings));
    } catch (error) {
      throw error;
    }
  }

  async resetSettings() {
    this.settings = { ...DEFAULT_SETTINGS };
    await this.saveSettings();
  }

  getSettings(): ModelSettings {
    return { ...this.settings };
  }

  async updateSettings(newSettings: Partial<ModelSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
  }

  getMaxTokens(): number {
    return this.settings.maxTokens;
  }

  async setMaxTokens(tokens: number) {
    await this.updateSettings({ maxTokens: tokens });
  }

  getTemperature(): number {
    return this.settings.temperature;
  }

  async setTemperature(temperature: number) {
    await this.updateSettings({ temperature });
  }

  getSeed(): number {
    return this.settings.seed;
  }

  async setSeed(seed: number) {
    await this.updateSettings({ seed });
  }

  getGrammar(): string {
    return this.settings.grammar;
  }

  async setGrammar(grammar: string) {
    await this.updateSettings({ grammar });
  }

  getJinja(): boolean {
    return this.settings.jinja;
  }

  async setJinja(jinja: boolean) {
    await this.updateSettings({ jinja });
  }

  getEnableThinking(): boolean {
    return this.settings.enableThinking;
  }

  async setEnableThinking(enableThinking: boolean) {
    await this.updateSettings({ enableThinking });
  }

  getDryMultiplier(): number {
    return this.settings.dryMultiplier;
  }

  async setDryMultiplier(dryMultiplier: number) {
    await this.updateSettings({ dryMultiplier });
  }

  getMirostat(): number {
    return this.settings.mirostat;
  }

  async setMirostat(mirostat: number) {
    await this.updateSettings({ mirostat });
  }

  async setMirostatParams(mirostat: number, tau: number, eta: number) {
    await this.updateSettings({ 
      mirostat, 
      mirostatTau: tau, 
      mirostatEta: eta 
    });
  }

  async setPenaltyParams(repeat: number, freq: number, present: number, lastN: number) {
    await this.updateSettings({
      penaltyRepeat: repeat,
      penaltyFreq: freq,
      penaltyPresent: present,
      penaltyLastN: lastN
    });
  }

  async setDryParams(multiplier: number, base: number, allowedLength: number, penaltyLastN: number, sequenceBreakers: string[]) {
    await this.updateSettings({
      dryMultiplier: multiplier,
      dryBase: base,
      dryAllowedLength: allowedLength,
      dryPenaltyLastN: penaltyLastN,
      drySequenceBreakers: sequenceBreakers
    });
  }

  async setLogitBias(logitBias: Array<Array<number>>) {
    await this.updateSettings({ logitBias });
  }

  private queueToken(token: string): void {
    this.tokenQueue.push({
      token,
      timestamp: Date.now()
    });
  }

  private async processTokenQueue(onToken?: (token: string) => boolean | void): Promise<void> {
    if (this.isProcessingTokens || this.tokenQueue.length === 0) {
      return;
    }

    this.isProcessingTokens = true;

    try {
      const tokensToProcess = [...this.tokenQueue];
      this.tokenQueue = [];

      for (const item of tokensToProcess) {
        if (this.isCancelled) {
          break;
        }

        if (onToken) {
          const shouldContinue = onToken(item.token);
          if (shouldContinue === false) {
            this.isCancelled = true;
            break;
          }
        }
      }
    } finally {
      this.isProcessingTokens = false;
    }
  }

  private async waitForTokenQueueCompletion(): Promise<void> {
    const maxWaitTime = 5000;
    const checkInterval = 50; 
    let elapsed = 0;

    while ((this.tokenQueue.length > 0 || this.isProcessingTokens) && elapsed < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
    }

    if (elapsed >= maxWaitTime) {
      console.warn('[LlamaManager] Token queue completion timeout reached');
    }
  }

  private clearTokenQueue(): void {
    this.tokenQueue = [];
    this.isProcessingTokens = false;
    this.tokenProcessingPromise = null;
  }

  async generateResponse(
    messages: Array<{ role: string; content: string }>,
    onToken?: (token: string) => boolean | void
  ) {
    if (!this.context) {
      throw new Error('Model not initialized');
    }

    let fullResponse = '';
    this.isCancelled = false;

    try {
      const processedMessages = await Promise.all(
        messages.map(async (msg) => {
          const processed = this.parseMultimodalMessage(msg.content);
          
          if (this.isMultimodalEnabled && (processed.images?.length || processed.audioFiles?.length)) {
            try {
              const content = await this.createMultimodalContent(processed);
              
              if (content.length === 0) {
                console.warn('[LlamaManager] No valid multimodal content created, falling back to text');
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
              console.error('[LlamaManager] Error creating multimodal content:', error);
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

      console.log('[LlamaManager] Final processed messages:', JSON.stringify(processedMessages, null, 2));

      const result = await this.context.completion(
        {
          messages: processedMessages,
          n_predict: this.settings.maxTokens,
          stop: this.settings.stopWords,
          temperature: this.settings.temperature,
          top_k: this.settings.topK,
          top_p: this.settings.topP,
          min_p: this.settings.minP,
          jinja: this.settings.jinja,
          grammar: this.settings.grammar || undefined,
          n_probs: this.settings.nProbs,
          penalty_last_n: this.settings.penaltyLastN,
          penalty_repeat: this.settings.penaltyRepeat,
          penalty_freq: this.settings.penaltyFreq,
          penalty_present: this.settings.penaltyPresent,
          mirostat: this.settings.mirostat,
          mirostat_tau: this.settings.mirostatTau,
          mirostat_eta: this.settings.mirostatEta,
          dry_multiplier: this.settings.dryMultiplier,
          dry_base: this.settings.dryBase,
          dry_allowed_length: this.settings.dryAllowedLength,
          dry_penalty_last_n: this.settings.dryPenaltyLastN,
          dry_sequence_breakers: this.settings.drySequenceBreakers,
          ignore_eos: this.settings.ignoreEos,
          logit_bias: this.settings.logitBias.length > 0 ? this.settings.logitBias : undefined,
          seed: this.settings.seed,
          xtc_probability: this.settings.xtcProbability,
          xtc_threshold: this.settings.xtcThreshold,
          typical_p: this.settings.typicalP,
          enable_thinking: this.settings.enableThinking,
        },
        (data) => {
          if (this.isCancelled) {
            return false;
          }
          
          if (!this.settings.stopWords.includes(data.token)) {
            fullResponse += data.token;
            
            this.queueToken(data.token);
            
            if (!this.tokenProcessingPromise) {
              this.tokenProcessingPromise = this.processTokenQueue(onToken).finally(() => {
                this.tokenProcessingPromise = null;
              });
            }
            
            return !this.isCancelled;
          }
          return false;
        }
      );

      await this.waitForTokenQueueCompletion();

      return fullResponse.trim();
    } catch (error) {
      console.error('[LlamaManager] Error in generateResponse:', error);
      throw error;
    } finally {
      this.clearTokenQueue();
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

    try {
      let fullResponse = '';
      this.isCancelled = false;

      await this.context.completion(
        {
          messages: titlePrompt,
          n_predict: 50,
          stop: [...this.settings.stopWords, '\n', '\\n'],
          temperature: 0.3,
          top_k: 30,
          top_p: 0.8,
          min_p: 0.05,
          jinja: this.settings.jinja,
          grammar: this.settings.grammar || undefined,
          n_probs: 0,
          penalty_last_n: this.settings.penaltyLastN,
          penalty_repeat: this.settings.penaltyRepeat,
          penalty_freq: this.settings.penaltyFreq,
          penalty_present: this.settings.penaltyPresent,
          mirostat: this.settings.mirostat,
          mirostat_tau: this.settings.mirostatTau,
          mirostat_eta: this.settings.mirostatEta,
          dry_multiplier: this.settings.dryMultiplier,
          dry_base: this.settings.dryBase,
          dry_allowed_length: this.settings.dryAllowedLength,
          dry_penalty_last_n: this.settings.dryPenaltyLastN,
          dry_sequence_breakers: this.settings.drySequenceBreakers,
          ignore_eos: false,
          logit_bias: this.settings.logitBias.length > 0 ? this.settings.logitBias : undefined,
          seed: this.settings.seed,
          xtc_probability: this.settings.xtcProbability,
          xtc_threshold: this.settings.xtcThreshold,
          typical_p: this.settings.typicalP,
          enable_thinking: this.settings.enableThinking,
        },
        (data) => {
          if (this.isCancelled) {
            return false;
          }
          
          if (!this.settings.stopWords.includes(data.token) && data.token !== '\n' && data.token !== '\\n') {
            fullResponse += data.token;
            return true;
          }
          return false;
        }
      );

      const title = fullResponse.trim().replace(/['"]/g, '').substring(0, 50);
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
    
    if (this.context) {
      try {
        if (typeof this.context.stopCompletion === 'function') {
          await this.context.stopCompletion();
          console.log('[LlamaManager] Completion stopped using native method');
        } else {
          console.log('[LlamaManager] Native stopCompletion not available, using fallback');
        }
      } catch (error) {
        console.error('[LlamaManager] Error stopping completion:', error);
      }
    }

    await this.waitForTokenQueueCompletion();
  }

  async cancelGeneration() {
    this.isCancelled = true;
    
    await this.stopCompletion();
    
    this.clearTokenQueue();
    
    if (this.modelPath && this.context) {
      try {
        const currentModelPath = this.modelPath;
        const currentMmProjectorPath = this.mmProjectorPath;
        
        await this.releaseMultimodal();
        await this.context.release();
        this.context = null;
        
        this.context = await initLlama({
          model: currentModelPath,
          use_mlock: true,
          n_ctx: 6144,
          n_batch: 512,
          n_threads: Platform.OS === 'ios' ? 6 : 4,
          n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
          embedding: false,
          rope_freq_base: 10000,
          rope_freq_scale: 1,
          ctx_shift: false,
        });

        if (currentMmProjectorPath) {
          await this.initMultimodal(currentMmProjectorPath);
        }
        
      } catch (error) {
        this.context = null;
        this.isMultimodalEnabled = false;
        this.multimodalSupport = { vision: false, audio: false };
      }
    }
  }

  async release() {
    try {
      this.isCancelled = true;
      
      this.clearTokenQueue();
      
      if (this.context) {
        await this.releaseMultimodal();
        await this.context.release();
        this.context = null;
        this.modelPath = null;
        this.mmProjectorPath = null;
      }
    } catch (error) {
      console.error('Release error:', error);
      throw error;
    }
  }

  emergencyCleanup() {
    this.isCancelled = true;
    this.clearTokenQueue();
    console.log('[LlamaManager] Emergency cleanup completed');
  }

  getModelPath() {
    return this.modelPath;
  }

  getMultimodalProjectorPath() {
    return this.mmProjectorPath;
  }

  isMultimodalInitialized(): boolean {
    return this.isMultimodalEnabled;
  }

  getMultimodalSupport(): MultimodalSupport {
    return { ...this.multimodalSupport };
  }

  hasVisionSupport(): boolean {
    return this.isMultimodalEnabled && this.multimodalSupport.vision;
  }

  hasAudioSupport(): boolean {
    return this.isMultimodalEnabled && this.multimodalSupport.audio;
  }

  async tokenizeWithMedia(text: string, mediaPaths: string[] = []): Promise<any> {
    if (!this.context) {
      throw new Error('Model not initialized');
    }

    try {
      const result = await this.context.tokenize(text, {
        media_paths: mediaPaths
      });
      
      console.log('[LlamaManager] Tokenize result:', {
        tokenCount: result.tokens?.length || 0,
        hasMedia: (result as any).has_media,
        mediaPositions: (result as any).chunk_pos_media
      });

      return result;
    } catch (error) {
      console.error('[LlamaManager] Error tokenizing with media:', error);
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
      console.warn('Memory info check failed:', error);
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
      await this.release();
      await this.initializeModel(modelPath, mmProjectorPath);
      this.events.emit('model-loaded', modelPath);
      return true;
    } catch (error) {
      console.error('Error loading model:', error);
      return false;
    }
  }

  async unloadModel() {
    await this.release();
    this.events.emit('model-unloaded');
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