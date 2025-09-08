import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ModelSettings {
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

export interface ModelSettingsConfig {
  useGlobalSettings: boolean;
  customSettings?: ModelSettings;
}

const STORAGE_KEY = '@model_settings';

class ModelSettingsService {
  private cache: { [modelPath: string]: ModelSettingsConfig } = {};
  private isInitialized: boolean = false;

  private async initializeIfNeeded() {
    if (this.isInitialized) return;
    
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        const isCorrupted = Object.keys(data).some(key => 
          data[key] && typeof data[key] === 'object' && data[key].customSettings && 
          Object.keys(data[key].customSettings).some(settingsKey => settingsKey.includes('file://'))
        );
        
        if (isCorrupted) {
          await this.clearCorruptedData();
        }
      }
    } catch (error) {
      console.error('[ModelSettingsService] Error during initialization:', error);
    }
    
    this.isInitialized = true;
  }

  async getModelSettings(modelPath: string): Promise<ModelSettingsConfig> {
    await this.initializeIfNeeded();
    
    if (this.cache[modelPath]) {
      return this.cache[modelPath];
    }

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const allSettings = stored ? JSON.parse(stored) : {};
      
      const modelSettings = allSettings[modelPath] || {
        useGlobalSettings: true
      };
      
      this.cache[modelPath] = modelSettings;
      return modelSettings;
    } catch (error) {
      console.error('Error loading per-model settings:', error);
      return { useGlobalSettings: true };
    }
  }

  async setModelSettings(modelPath: string, settings: ModelSettingsConfig): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const allSettings = stored ? JSON.parse(stored) : {};
      
      allSettings[modelPath] = settings;
      this.cache[modelPath] = settings;
      
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(allSettings));
    } catch (error) {
      console.error('Error saving per-model settings:', error);
      throw error;
    }
  }

  async toggleUseGlobalSettings(modelPath: string): Promise<boolean> {
    const current = await this.getModelSettings(modelPath);
    const newSettings = {
      ...current,
      useGlobalSettings: !current.useGlobalSettings
    };
    
    await this.setModelSettings(modelPath, newSettings);
    return newSettings.useGlobalSettings;
  }

  async setCustomSettings(modelPath: string, customSettings: ModelSettings): Promise<void> {
    const current = await this.getModelSettings(modelPath);
    const newSettings = {
      ...current,
      customSettings,
      useGlobalSettings: false
    };
    
    await this.setModelSettings(modelPath, newSettings);
  }

  async deleteModelSettings(modelPath: string): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const allSettings = stored ? JSON.parse(stored) : {};
      
      delete allSettings[modelPath];
      delete this.cache[modelPath];
      
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(allSettings));
    } catch (error) {
      console.error('Error deleting per-model settings:', error);
    }
  }

  clearCache(): void {
    this.cache = {};
  }

  async clearCorruptedData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      this.cache = {};
    } catch (error) {
      console.error('Error clearing corrupted data:', error);
    }
  }
}

export const modelSettingsService = new ModelSettingsService();