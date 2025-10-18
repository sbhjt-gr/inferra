import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface GpuSettings {
  enabled: boolean;
  layers: number;
}

const STORAGE_KEY = '@gpu_settings';
export const GPU_LAYER_MIN = 1;
export const GPU_LAYER_MAX = 100;
export const DEFAULT_GPU_LAYERS = Platform.OS === 'ios' ? 99 : 32;

const DEFAULT_SETTINGS: GpuSettings = {
  enabled: Platform.OS === 'ios',
  layers: DEFAULT_GPU_LAYERS,
};

class GpuSettingsService {
  private settings: GpuSettings = {...DEFAULT_SETTINGS};
  private initialized = false;

  private async ensureLoaded(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          layers: this.clampLayers(parsed?.layers ?? DEFAULT_SETTINGS.layers),
          enabled:
            typeof parsed?.enabled === 'boolean'
              ? parsed.enabled
              : DEFAULT_SETTINGS.enabled,
        };
      } else {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      }
    } catch (error) {
      this.settings = {...DEFAULT_SETTINGS};
    } finally {
      this.initialized = true;
    }
  }

  private clampLayers(layers: number): number {
    const numeric = Number.isFinite(layers) ? Math.round(layers) : DEFAULT_SETTINGS.layers;
    if (numeric < GPU_LAYER_MIN) {
      return GPU_LAYER_MIN;
    }
    if (numeric > GPU_LAYER_MAX) {
      return GPU_LAYER_MAX;
    }
    return numeric;
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      // Persist errors are ignored on purpose but logged for visibility.
      console.warn('Failed to persist GPU settings', error);
    }
  }

  async loadSettings(): Promise<GpuSettings> {
    await this.ensureLoaded();
    return this.settings;
  }

  getSettingsSync(): GpuSettings {
    return {...this.settings};
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.ensureLoaded();
    this.settings = {
      ...this.settings,
      enabled,
    };
    await this.persist();
  }

  async setLayers(layers: number): Promise<void> {
    await this.ensureLoaded();
    this.settings = {
      ...this.settings,
      layers: this.clampLayers(layers),
    };
    await this.persist();
  }
}

export const gpuSettingsService = new GpuSettingsService();
