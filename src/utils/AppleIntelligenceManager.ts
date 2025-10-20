import { Platform } from 'react-native';
import { apple } from '@react-native-ai/apple';
import { streamText, type ModelMessage } from 'ai';
import type { ChatMessage } from './ChatManager';

class AppleIntelligenceManager {
  private abortController: AbortController | null = null;
  private availability: boolean | null = null;

  async isSupported(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return false;
    }
    if (this.availability !== null) {
      return this.availability;
    }
    try {
      const available = typeof apple.isAvailable === 'function' ? apple.isAvailable() : false;
      this.availability = available;
      return available;
    } catch (error) {
      this.availability = false;
      return false;
    }
  }

  resetAvailability() {
    this.availability = null;
  }

  private parseMessage(message: ChatMessage): ModelMessage | null {
    const trimmed = message.content?.trim();
    if (!trimmed) {
      return null;
    }
    let content: string = trimmed;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.type === 'ocr_result') {
        const instruction = typeof parsed.internalInstruction === 'string' ? parsed.internalInstruction : '';
        const userPrompt = typeof parsed.userPrompt === 'string' ? parsed.userPrompt : '';
        content = `${instruction}\n\nUser request: ${userPrompt || 'Please analyze the extracted text.'}`;
      } else if (parsed && parsed.type === 'multimodal') {
        throw new Error('Apple Intelligence does not support multimodal image analysis. Please use OCR mode.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('multimodal')) {
        throw error;
      }
    }
    return {
      role: message.role,
      content,
    };
  }

  private prepareMessages(messages: ChatMessage[]): ModelMessage[] {
    const prepared: ModelMessage[] = [];
    for (const message of messages) {
      const parsed = this.parseMessage(message);
      if (parsed) {
        prepared.push(parsed);
      }
    }
    return prepared;
  }

  async streamResponse(
    messages: ChatMessage[],
    options: { temperature?: number; topP?: number; topK?: number; maxTokens?: number },
    onChunk: (chunk: string) => boolean
  ): Promise<void> {
    const supported = await this.isSupported();
    if (!supported) {
      throw new Error('Apple Intelligence is not available on this device.');
    }
    const formattedMessages = this.prepareMessages(messages);
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    try {
      const result = streamText({
        model: apple(),
        messages: formattedMessages,
        temperature: options.temperature,
        topP: options.topP,
        topK: options.topK,
        maxOutputTokens: options.maxTokens,
        abortSignal: controller.signal,
      });
      for await (const chunk of result.textStream) {
        const shouldContinue = onChunk(chunk);
        if (shouldContinue === false) {
          controller.abort();
          break;
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        throw error;
      }
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
      }
    }
  }

  cancelStream() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export const appleIntelligenceManager = new AppleIntelligenceManager();
