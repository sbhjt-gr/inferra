import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ToolSource } from '../tools/ToolRegistry';

const STORAGE_KEY = 'inferrlm.tool_policy.v1';

export type ToolPolicyState = {
  globalEnabled: boolean;
  emergencyDisabled: boolean;
  sources: Record<ToolSource, boolean>;
  tools: Record<string, boolean>;
  providerEnabled: boolean;
};

const DEFAULT_STATE: ToolPolicyState = {
  globalEnabled: false,
  emergencyDisabled: false,
  sources: {
    stock: true,
    app_functions: false,
    root: false,
    skill: true,
    builtin: true,
  },
  tools: {},
  providerEnabled: false,
};

class ToolPolicyStoreClass {
  private state: ToolPolicyState = { ...DEFAULT_STATE, sources: { ...DEFAULT_STATE.sources }, tools: {} };
  private loaded = false;
  private listeners = new Set<(state: ToolPolicyState) => void>();

  async load(): Promise<ToolPolicyState> {
    if (this.loaded) {
      return this.snapshot();
    }
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ToolPolicyState>;
        this.state = {
          ...DEFAULT_STATE,
          ...parsed,
          sources: { ...DEFAULT_STATE.sources, ...(parsed.sources || {}) },
          tools: { ...(parsed.tools || {}) },
        };
      }
      console.log('policy_loaded');
    } catch {
      console.log('policy_load_fail');
      this.state = { ...DEFAULT_STATE, sources: { ...DEFAULT_STATE.sources }, tools: {} };
    }
    this.loaded = true;
    this.emit();
    return this.snapshot();
  }

  snapshot(): ToolPolicyState {
    return {
      ...this.state,
      sources: { ...this.state.sources },
      tools: { ...this.state.tools },
    };
  }

  subscribe(listener: (state: ToolPolicyState) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  async setGlobal(enabled: boolean): Promise<void> {
    this.state.globalEnabled = enabled;
    if (!enabled) {
      this.state.sources.app_functions = false;
      this.state.sources.root = false;
      this.state.providerEnabled = false;
    }
    console.log('policy_global', enabled);
    await this.persist();
  }

  async setEmergency(disabled: boolean): Promise<void> {
    this.state.emergencyDisabled = disabled;
    console.log('policy_emergency', disabled);
    await this.persist();
  }

  async setSource(source: ToolSource, enabled: boolean): Promise<void> {
    this.state.sources[source] = enabled;
    console.log('policy_source', source, enabled);
    await this.persist();
  }

  async setTool(name: string, enabled: boolean): Promise<void> {
    this.state.tools[name] = enabled;
    console.log('policy_tool', name, enabled);
    await this.persist();
  }

  async setProvider(enabled: boolean): Promise<void> {
    this.state.providerEnabled = enabled;
    console.log('policy_provider', enabled);
    await this.persist();
  }

  isAllowed(name: string, source: ToolSource): boolean {
    if (this.state.emergencyDisabled) {
      return false;
    }
    if (source === 'stock' || source === 'skill' || source === 'builtin') {
      return this.state.sources[source] !== false && this.state.tools[name] !== false;
    }
    if (!this.state.globalEnabled) {
      return false;
    }
    if (!this.state.sources[source]) {
      return false;
    }
    return this.state.tools[name] !== false;
  }

  private async persist(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    this.emit();
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}

export const toolPolicyStore = new ToolPolicyStoreClass();
