import AsyncStorage from '@react-native-async-storage/async-storage';
import { ModelSettings } from './ModelSettingsService';
import { DEFAULT_SETTINGS } from '../config/llamaConfig';

export class LlamaSettingsManager {
  private settings: ModelSettings = { ...DEFAULT_SETTINGS };

  async loadSettings(): Promise<void> {
    try {
      const savedSettings = await AsyncStorage.getItem('@global_model_settings');
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

  async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem('@global_model_settings', JSON.stringify(this.settings));
    } catch (error) {
      throw error;
    }
  }

  async resetSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS };
    await this.saveSettings();
  }

  getSettings(): ModelSettings {
    return { ...this.settings };
  }

  async updateSettings(newSettings: Partial<ModelSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
  }

  getMaxTokens(): number {
    return this.settings.maxTokens;
  }

  async setMaxTokens(tokens: number): Promise<void> {
    await this.updateSettings({ maxTokens: tokens });
  }

  getTemperature(): number {
    return this.settings.temperature;
  }

  async setTemperature(temperature: number): Promise<void> {
    await this.updateSettings({ temperature });
  }

  getSeed(): number {
    return this.settings.seed;
  }

  async setSeed(seed: number): Promise<void> {
    await this.updateSettings({ seed });
  }

  getGrammar(): string {
    return this.settings.grammar;
  }

  async setGrammar(grammar: string): Promise<void> {
    await this.updateSettings({ grammar });
  }

  getJinja(): boolean {
    return this.settings.jinja;
  }

  async setJinja(jinja: boolean): Promise<void> {
    await this.updateSettings({ jinja });
  }

  getEnableThinking(): boolean {
    return this.settings.enableThinking;
  }

  async setEnableThinking(enableThinking: boolean): Promise<void> {
    await this.updateSettings({ enableThinking });
  }

  getDryMultiplier(): number {
    return this.settings.dryMultiplier;
  }

  async setDryMultiplier(dryMultiplier: number): Promise<void> {
    await this.updateSettings({ dryMultiplier });
  }

  getMirostat(): number {
    return this.settings.mirostat;
  }

  async setMirostat(mirostat: number): Promise<void> {
    await this.updateSettings({ mirostat });
  }

  async setMirostatParams(mirostat: number, tau: number, eta: number): Promise<void> {
    await this.updateSettings({ 
      mirostat, 
      mirostatTau: tau, 
      mirostatEta: eta 
    });
  }

  async setPenaltyParams(repeat: number, freq: number, present: number, lastN: number): Promise<void> {
    await this.updateSettings({
      penaltyRepeat: repeat,
      penaltyFreq: freq,
      penaltyPresent: present,
      penaltyLastN: lastN
    });
  }

  async setDryParams(multiplier: number, base: number, allowedLength: number, penaltyLastN: number, sequenceBreakers: string[]): Promise<void> {
    await this.updateSettings({
      dryMultiplier: multiplier,
      dryBase: base,
      dryAllowedLength: allowedLength,
      dryPenaltyLastN: penaltyLastN,
      drySequenceBreakers: sequenceBreakers
    });
  }

  async setLogitBias(logitBias: Array<Array<number>>): Promise<void> {
    await this.updateSettings({ logitBias });
  }
}
