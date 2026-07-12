import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ToolSource } from '../tools/ToolRegistry';

const STORAGE_KEY = 'inferrlm.tool_audit.v1';
const MAX_EVENTS = 100;

export type ToolAuditEvent = {
  id: string;
  tool: string;
  source: ToolSource;
  decision: 'allowed' | 'denied' | 'cancelled' | 'failed' | 'ok';
  outcome: 'ok' | 'error' | 'denied' | 'cancelled';
  durationMs: number;
  timestamp: number;
};

class ToolAuditStoreClass {
  private events: ToolAuditEvent[] = [];
  private loaded = false;
  private listeners = new Set<(events: ToolAuditEvent[]) => void>();

  async load(): Promise<ToolAuditEvent[]> {
    if (this.loaded) {
      return this.snapshot();
    }
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.events = JSON.parse(raw) as ToolAuditEvent[];
      }
      console.log('audit_loaded', this.events.length);
    } catch {
      console.log('audit_load_fail');
      this.events = [];
    }
    this.loaded = true;
    this.emit();
    return this.snapshot();
  }

  snapshot(): ToolAuditEvent[] {
    return this.events.map(event => ({ ...event }));
  }

  subscribe(listener: (events: ToolAuditEvent[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  async record(input: Omit<ToolAuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const event: ToolAuditEvent = {
      ...input,
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    console.log('audit_record', event.tool, event.outcome);
    this.events = [event, ...this.events].slice(0, MAX_EVENTS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
    this.emit();
  }

  async clear(): Promise<void> {
    this.events = [];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
    console.log('audit_clear');
    this.emit();
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}

export const toolAuditStore = new ToolAuditStoreClass();
