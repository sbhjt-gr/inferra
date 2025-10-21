import { AppleFoundationModels } from '@react-native-ai/apple';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const ENABLED_KEY = 'appleFoundationEnabled';

type AppleFoundationMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type AppleFoundationOptions = {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
};

class AppleFoundationService {
  private activeStream:
    | {
        id: string;
        listeners: { remove(): void }[];
        wake: () => void;
        markCancelled: () => void;
      }
    | null = null;

  isAvailable(): boolean {
    if (Platform.OS !== 'ios') {
      return false;
    }
    try {
      return AppleFoundationModels.isAvailable();
    } catch (error) {
      return false;
    }
  }

  async isEnabled(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return false;
    }
    const stored = await AsyncStorage.getItem(ENABLED_KEY);
    if (stored !== null) {
      return stored === 'true';
    }
    const available = this.isAvailable();
    await AsyncStorage.setItem(ENABLED_KEY, available ? 'true' : 'false');
    return available;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
    if (!enabled) {
      this.cancel();
    }
  }

  async generateResponse(messages: AppleFoundationMessage[], options: AppleFoundationOptions = {}): Promise<string> {
    await this.ensureAvailable();

    const mappedMessages = messages.map(message => ({
      role: message.role,
      content: message.content,
    }));

    const response = await AppleFoundationModels.generateText(mappedMessages, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      topK: options.topK,
    });

    return response
      .map(part => {
        switch (part.type) {
          case 'text':
            return part.text;
          default:
            return '';
        }
      })
      .join('');
  }

  async *streamResponse(messages: AppleFoundationMessage[], options: AppleFoundationOptions = {}): AsyncGenerator<string, void, unknown> {
    await this.ensureAvailable();
    this.cancel();
    const state = {
      currentContent: '',
      queue: [] as string[],
      done: false,
      error: null as Error | null,
      waitingResolve: null as (() => void) | null,
      cancelled: false,
    };
    const mappedMessages = messages.map(message => ({
      role: message.role,
      content: message.content,
    }));
    const streamId = AppleFoundationModels.generateStream(mappedMessages, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      topK: options.topK,
    });

    const wake = () => {
      if (state.waitingResolve) {
        const resolve = state.waitingResolve;
        state.waitingResolve = null;
        resolve();
      }
    };

    const listeners = [
      AppleFoundationModels.onStreamUpdate(data => {
        if (data.streamId !== streamId) {
          return;
        }
        const delta = data.content.slice(state.currentContent.length);
        state.currentContent = data.content;
        if (delta.length > 0) {
          state.queue.push(delta);
          wake();
        }
      }),
      AppleFoundationModels.onStreamComplete(data => {
        if (data.streamId !== streamId) {
          return;
        }
        state.done = true;
        wake();
      }),
      AppleFoundationModels.onStreamError(data => {
        if (data.streamId !== streamId) {
          return;
        }
        if (state.cancelled) {
          state.done = true;
          wake();
          return;
        }
        state.error = new Error(data.error || 'Apple Intelligence stream error');
        state.done = true;
        wake();
      }),
    ];

    this.activeStream = {
      id: streamId,
      listeners,
      wake,
      markCancelled: () => {
        if (!state.done) {
          state.cancelled = true;
          state.done = true;
          wake();
        }
      },
    };

    try {
      while (true) {
        if (state.queue.length > 0) {
          yield state.queue.shift() as string;
          continue;
        }

        if (state.error) {
          throw state.error;
        }

        if (state.done) {
          break;
        }

        await new Promise<void>(resolve => {
          state.waitingResolve = resolve;
        });
      }

      if (state.error) {
        throw state.error;
      }
    } finally {
      listeners.forEach(listener => listener.remove());
      if (this.activeStream && this.activeStream.id === streamId) {
        this.activeStream = null;
      }
      wake();
    }
  }

  cancel(): void {
    if (this.activeStream) {
      try {
        AppleFoundationModels.cancelStream(this.activeStream.id);
      } catch (error) {
      }
      this.activeStream.markCancelled();
      this.activeStream = null;
    }
  }

  getIOSVersion(): number | null {
    if (Platform.OS !== 'ios') {
      return null;
    }
    const version = Platform.Version;
    if (typeof version === 'number') {
      return version;
    }
    if (typeof version === 'string') {
      const major = parseInt(version.split('.')[0], 10);
      return Number.isNaN(major) ? null : major;
    }
    return null;
  }

  meetsMinimumRequirements(): boolean {
    const version = this.getIOSVersion();
    return version !== null && version >= 26 && this.isAvailable();
  }

  private async ensureAvailable(): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Apple Intelligence is not available on this device');
    }
    const enabled = await this.isEnabled();
    if (!enabled) {
      throw new Error('Apple Foundation is disabled');
    }
  }
}

export const appleFoundationService = new AppleFoundationService();
export type { AppleFoundationMessage, AppleFoundationOptions };
