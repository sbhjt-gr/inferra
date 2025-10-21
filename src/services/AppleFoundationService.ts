import { apple } from '@react-native-ai/apple';
import { streamText } from 'ai';
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
  private abortController: AbortController | null = null;

  isAvailable(): boolean {
    if (Platform.OS !== 'ios') {
      return false;
    }
    try {
      return apple.isAvailable();
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
    let fullText = '';
    for await (const chunk of this.streamResponse(messages, options)) {
      fullText += chunk;
    }
    return fullText;
  }

  async *streamResponse(messages: AppleFoundationMessage[], options: AppleFoundationOptions = {}): AsyncGenerator<string, void, unknown> {
    await this.ensureAvailable();
    this.cancel();
    const controller = new AbortController();
    this.abortController = controller;
    const mappedMessages = messages.map(message => ({
      role: message.role,
      content: message.content,
    }));
    const params: Record<string, unknown> = {
      model: apple(),
      messages: mappedMessages,
    };
    if (options.temperature !== undefined) {
      params.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      params.maxTokens = options.maxTokens;
    }
    if (options.topP !== undefined) {
      params.topP = options.topP;
    }
    if (options.topK !== undefined) {
      params.topK = options.topK;
    }
    params.abortSignal = controller.signal;
    const { textStream } = await streamText(params as any);
    try {
      for await (const chunk of textStream) {
        if (controller.signal.aborted) {
          break;
        }
        yield chunk;
      }
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
      }
    }
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
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
