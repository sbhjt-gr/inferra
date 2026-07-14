import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { EngineId, InferenceManager } from '../managers/inference-manager';
import { llamaAdapter } from '../managers/llama-manager';
import { litertManager } from '../managers/litert-manager';
import { mlxManager } from '../managers/mlx-manager';
import { featureCaps, isFeatureOn } from './feature-availability';

const keyActive = 'inference_engine_active';
const keyEnabled = 'inference_engine_enabled';

class EngineService {
  private engine: EngineId = 'llama';
  private enabled: Record<EngineId, boolean> = {
    llama: true,
    mlx: Platform.OS === 'ios',
    litert: true,
  };
  private activeModelPath: string | null = null;
  private map: Record<EngineId, InferenceManager> = {
    llama: llamaAdapter,
    mlx: mlxManager,
    litert: litertManager,
  };

  private normalizeEnabled(enabled: Record<EngineId, boolean>) {
    if (enabled.llama || enabled.mlx || enabled.litert) {
      return enabled;
    }

    return {
      ...enabled,
      llama: true,
    };
  }

  private anyReadyEngine(): EngineId | null {
    if (this.activeModelPath) {
      const forPath = this.getEngineForModel(this.activeModelPath);
      if (this.map[forPath].ready()) {
        return forPath;
      }
    }

    for (const id of ['llama', 'mlx', 'litert'] as EngineId[]) {
      if (this.map[id].ready()) {
        return id;
      }
    }

    return null;
  }

  private resolveManager(): InferenceManager {
    const readyEngine = this.anyReadyEngine();
    if (readyEngine && readyEngine !== this.engine) {
      console.log('engine_pointer_resync', this.engine, '->', readyEngine, this.activeModelPath);
      this.engine = readyEngine;
    }
    return this.map[this.engine];
  }

  async load() {
    const [storedActive, storedEnabled] = await Promise.all([
      AsyncStorage.getItem(keyActive),
      AsyncStorage.getItem(keyEnabled),
    ]);

    const liveReady = this.anyReadyEngine();

    if (storedActive === 'mlx' || storedActive === 'llama' || storedActive === 'litert') {
      if (liveReady) {
        if (this.engine !== liveReady) {
          console.log('engine_load_keep_live', this.engine, storedActive, liveReady);
          this.engine = liveReady;
        }
      } else if (storedActive === 'mlx' && Platform.OS === 'android') {
        this.engine = 'llama';
      } else {
        this.engine = storedActive;
      }
    }

    if (storedEnabled) {
      try {
        const parsed = JSON.parse(storedEnabled) as Record<EngineId, boolean>;
        this.enabled = this.normalizeEnabled({
          llama: parsed.llama !== false,
          mlx: Platform.OS === 'ios' ? (parsed.mlx !== false) : false,
          litert: parsed.litert !== false,
        });
      } catch {
      }
    }

    return { active: this.engine, enabled: { ...this.enabled } };
  }

  async set(engine: EngineId, options?: { force?: boolean }) {
    const liveReady = this.anyReadyEngine();
    if (!options?.force && liveReady && liveReady !== engine) {
      console.log('engine_set_defer_live', this.engine, engine, liveReady);
      await AsyncStorage.setItem(keyActive, engine);
      return;
    }
    this.engine = engine;
    await AsyncStorage.setItem(keyActive, engine);
  }

  async setEnabled(engine: EngineId, value: boolean) {
    this.enabled = this.normalizeEnabled({ ...this.enabled, [engine]: value });
    await AsyncStorage.setItem(keyEnabled, JSON.stringify(this.enabled));
  }

  get() {
    return this.anyReadyEngine() || this.engine;
  }

  getEnabled() {
    return { ...this.enabled };
  }

  isEnabled(engine: EngineId) {
    return Boolean(this.enabled[engine]);
  }

  getActiveModelPath() {
    return this.activeModelPath;
  }

  getEngineForModel(modelPath: string, modelFormat?: string): EngineId {
    if (modelFormat === 'gguf') return 'llama';
    if (modelFormat === 'mlx') return 'mlx';
    if (modelFormat === 'litert') return 'litert';
    const lower = modelPath.toLowerCase();
    if (lower.endsWith('.gguf')) return 'llama';
    if (lower.endsWith('.litertlm') || lower.endsWith('.task')) return 'litert';
    if (
      lower.endsWith('.safetensors') ||
      lower.endsWith('.json') ||
      lower.includes('/huggingface/models/') ||
      lower.includes('mlx-community') ||
      lower.includes('mlx')
    ) return 'mlx';
    return 'llama';
  }

  async initModel(modelPath: string, projectorPath?: string, modelFormat?: string) {
    const engine = this.getEngineForModel(modelPath, modelFormat);
    if (!this.isEnabled(engine)) {
      throw new Error('engine_disabled');
    }

    const live = this.anyReadyEngine();
    if (live && live !== engine) {
      await this.map[live].release();
      this.activeModelPath = null;
    } else if (this.map[engine].ready()) {
      await this.map[engine].release();
      this.activeModelPath = null;
    }

    await this.set(engine, { force: true });
    await this.map[engine].init(modelPath, projectorPath);
    this.activeModelPath = modelPath;
  }

  async release() {
    await this.resolveManager().release();
    this.activeModelPath = null;
  }

  mgr() {
    return this.resolveManager();
  }

  stop() {
    this.resolveManager().stop?.();
  }

  async resetChatSession() {
    if ((this.anyReadyEngine() || this.engine) !== 'litert') {
      return;
    }
    await litertManager.resetSession(true);
  }

  ready() {
    return this.resolveManager().ready();
  }

  caps() {
    return featureCaps[this.anyReadyEngine() || this.engine];
  }

  on(feature: keyof typeof featureCaps['llama']) {
    return isFeatureOn(this.anyReadyEngine() || this.engine, feature);
  }

  needsRestart() {
    return false;
  }
}

export const engineService = new EngineService();
