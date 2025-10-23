import { ChatMessage } from '../utils/ChatManager';
import { llamaManager } from '../utils/LlamaManager';
import { onlineModelService } from './OnlineModelService';
import chatManager from '../utils/ChatManager';
import { generateRandomId } from '../utils/homeScreenUtils';
import { appleFoundationService } from './AppleFoundationService';
import type { ProviderType } from './ModelManagementService';

interface RegenerationCallbacks {
  setMessages: (messages: ChatMessage[]) => void;
  setStreamingMessageId: (id: string | null) => void;
  setStreamingMessage: (message: string) => void;
  setStreamingThinking: (thinking: string) => void;
  setStreamingStats: (stats: { tokens: number; duration: number; firstTokenTime?: number; avgTokenTime?: number } | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  setIsRegenerating: (regenerating: boolean) => void;
  saveMessagesImmediate: (messages: ChatMessage[]) => Promise<void>;
  saveMessages: (messages: ChatMessage[]) => void;
  saveMessagesDebounced: { cancel: () => void };
  handleApiError: (error: unknown, provider: 'Gemini' | 'OpenAI' | 'DeepSeek' | 'Claude') => void;
}

export class RegenerationService {
  private cancelGenerationRef: React.MutableRefObject<boolean>;
  private callbacks: RegenerationCallbacks;

  constructor(cancelGenerationRef: React.MutableRefObject<boolean>, callbacks: RegenerationCallbacks) {
    this.cancelGenerationRef = cancelGenerationRef;
    this.callbacks = callbacks;
  }

  async handleRegenerate(
    messages: ChatMessage[],
    activeProvider: ProviderType | null,
    settings: any
  ): Promise<void> {
    if (messages.length < 2) return;
    
    const hasLocalModel = !!llamaManager.getModelPath();

    let hasValidModel = false;
    let validProvider = activeProvider;

    if (!activeProvider) {
      hasValidModel = false;
      validProvider = null;
    } else if (activeProvider === 'local') {
      hasValidModel = hasLocalModel;
    } else if (activeProvider === 'apple-foundation') {
      try {
        const available = appleFoundationService.isAvailable();
        const enabled = await appleFoundationService.isEnabled();
        hasValidModel = available && enabled;
        if (!hasValidModel) {
          validProvider = null;
        }
      } catch (error) {
        hasValidModel = false;
        validProvider = null;
      }
    } else {
      try {
        const hasApiKey = await onlineModelService.hasApiKey(activeProvider);
        hasValidModel = hasApiKey;
        if (!hasApiKey) {
          validProvider = null;
        }
      } catch (error) {
        hasValidModel = false;
        validProvider = null;
      }
    }
    
    if (!hasValidModel || !validProvider) {
      throw new Error('No valid model selected');
    }
    
    const lastUserMessageIndex = [...messages].reverse().findIndex(msg => msg.role === 'user');
    if (lastUserMessageIndex === -1) return;
    
    const newMessages = messages.slice(0, -1);
    
    this.callbacks.setMessages(newMessages);
    await this.callbacks.saveMessagesImmediate(newMessages);
    
    const assistantMessage: ChatMessage = {
      id: generateRandomId(),
      content: '',
      role: 'assistant',
      stats: {
        duration: 0,
        tokens: 0,
      },
    };
    
    const updatedMessages = [...newMessages, assistantMessage];
    this.callbacks.setMessages(updatedMessages);
    await this.callbacks.saveMessagesImmediate(updatedMessages);
    this.callbacks.setIsRegenerating(true);
    this.cancelGenerationRef.current = false;
    
    this.callbacks.setStreamingMessageId(assistantMessage.id);
    this.callbacks.setStreamingMessage('');
    this.callbacks.setStreamingThinking('');
    this.callbacks.setStreamingStats({ tokens: 0, duration: 0 });
    this.callbacks.setIsStreaming(true);
    
    const startTime = Date.now();
    let tokenCount = 0;
    let fullResponse = '';
    let thinking = '';
    let isThinking = false;
    let firstTokenTime: number | null = null;
    
    try {
      const isOnlineModel = validProvider === 'gemini' || validProvider === 'chatgpt' || validProvider === 'deepseek' || validProvider === 'claude';
      const isAppleFoundation = validProvider === 'apple-foundation';

      if (isOnlineModel) {
        await this.processOnlineRegeneration(
          validProvider as 'gemini' | 'chatgpt' | 'deepseek' | 'claude',
          newMessages,
          settings,
          assistantMessage,
          startTime,
          tokenCount,
          fullResponse,
          firstTokenTime
        );
      } else if (isAppleFoundation) {
        await this.processAppleFoundationRegeneration(
          newMessages,
          settings,
          assistantMessage,
          startTime,
          tokenCount,
          fullResponse,
          firstTokenTime
        );
      } else {
        await this.processLocalRegeneration(
          newMessages,
          settings,
          assistantMessage,
          startTime,
          tokenCount,
          fullResponse,
          thinking,
          isThinking,
          firstTokenTime
        );
      }
      
    } catch (error) {
      throw error;
    } finally {
      this.callbacks.setIsRegenerating(false);
      this.callbacks.setIsStreaming(false);
      this.callbacks.setStreamingMessageId(null);
      this.callbacks.setStreamingThinking('');
      this.callbacks.setStreamingStats(null);
      
      this.callbacks.saveMessagesDebounced.cancel();
    }
  }

  private async processOnlineRegeneration(
    validProvider: 'gemini' | 'chatgpt' | 'deepseek' | 'claude',
    newMessages: ChatMessage[],
    settings: any,
    assistantMessage: ChatMessage,
    startTime: number,
    tokenCount: number,
    fullResponse: string,
    firstTokenTime: number | null
  ): Promise<void> {
    const streamCallback = (partialResponse: string) => {
      if (this.cancelGenerationRef.current) {
        return false;
      }
      
      const currentTime = Date.now();
      
      if (firstTokenTime === null && partialResponse.trim().length > 0) {
        firstTokenTime = currentTime - startTime;
      }
      
      const wordCount = partialResponse.trim().split(/\s+/).filter(word => word.length > 0).length;
      tokenCount = Math.max(1, Math.ceil(wordCount * 1.33));
      fullResponse = partialResponse;
      
      const duration = (currentTime - startTime) / 1000;
      let avgTokenTime = undefined;
      
      if (firstTokenTime !== null && tokenCount > 0) {
        const timeAfterFirstToken = currentTime - (startTime + firstTokenTime);
        avgTokenTime = timeAfterFirstToken / tokenCount;
      }
      
      this.callbacks.setStreamingMessage(partialResponse);
      this.callbacks.setStreamingStats({
        tokens: tokenCount,
        duration: duration,
        firstTokenTime: firstTokenTime || undefined,
        avgTokenTime: avgTokenTime && avgTokenTime > 0 ? avgTokenTime : undefined
      });
      
      const finalMessage: ChatMessage = {
        ...assistantMessage,
        content: partialResponse,
        stats: {
          duration: duration,
          tokens: tokenCount,
          firstTokenTime: firstTokenTime || undefined,
          avgTokenTime: avgTokenTime && avgTokenTime > 0 ? avgTokenTime : undefined
        }
      };
      
      const finalMessages = [...newMessages, finalMessage];
      this.callbacks.setMessages(finalMessages);
      
      return !this.cancelGenerationRef.current;
    };

    const messageParams = [...newMessages]
      .filter(msg => msg.content.trim() !== '')
      .map(msg => ({ 
        id: generateRandomId(), 
        role: msg.role as 'system' | 'user' | 'assistant', 
        content: msg.content 
      }));

    const apiParams = {
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      topP: settings.topP,
      stream: true,
      streamTokens: true
    };

    try {
      switch (validProvider) {
        case 'gemini':
          await onlineModelService.sendMessageToGemini(messageParams, apiParams, streamCallback);
          break;
        case 'chatgpt':
          await onlineModelService.sendMessageToOpenAI(messageParams, apiParams, streamCallback);
          break;
        case 'deepseek':
          await onlineModelService.sendMessageToDeepSeek(messageParams, apiParams, streamCallback);
          break;
        case 'claude':
          await onlineModelService.sendMessageToClaude(messageParams, apiParams, streamCallback);
          break;
        default:
          const finalMessage: ChatMessage = {
            ...assistantMessage,
            content: `This model provider (${validProvider}) is not yet implemented.`,
            stats: { duration: 0, tokens: 0 }
          };
          
          const finalMessages = [...newMessages, finalMessage];
          this.callbacks.setMessages(finalMessages);
          this.callbacks.saveMessages(finalMessages);
          return;
      }
      
      if (!this.cancelGenerationRef.current) {
        let finalAvgTokenTime = undefined;
        if (firstTokenTime !== null && tokenCount > 0) {
          const timeAfterFirstToken = Date.now() - (startTime + firstTokenTime);
          finalAvgTokenTime = timeAfterFirstToken / tokenCount;
        }
        
        const finalMessage: ChatMessage = {
          ...assistantMessage,
          content: fullResponse,
          stats: {
            duration: (Date.now() - startTime) / 1000,
            tokens: tokenCount,
            firstTokenTime: firstTokenTime || undefined,
            avgTokenTime: finalAvgTokenTime && finalAvgTokenTime > 0 ? finalAvgTokenTime : undefined
          }
        };
        
        const finalMessages = [...newMessages, finalMessage];
        this.callbacks.setMessages(finalMessages);
        await this.callbacks.saveMessagesImmediate(finalMessages);
      }
    } catch (error) {
      this.callbacks.handleApiError(error, this.getProviderDisplayName(validProvider));
      this.callbacks.setIsRegenerating(false);
    }
  }

  private async processAppleFoundationRegeneration(
    newMessages: ChatMessage[],
    settings: any,
    assistantMessage: ChatMessage,
    startTime: number,
    tokenCount: number,
    fullResponse: string,
    firstTokenTime: number | null
  ): Promise<void> {
    let updateCounter = 0;

    try {
      const stream = appleFoundationService.streamResponse(
        newMessages.map(msg => ({ role: msg.role, content: msg.content })),
        {
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          topP: settings.topP,
          topK: settings.topK,
        }
      );

      for await (const chunk of stream) {
        if (this.cancelGenerationRef.current) {
          appleFoundationService.cancel();
          break;
        }

        if (firstTokenTime === null && chunk.trim().length > 0) {
          firstTokenTime = Date.now() - startTime;
        }

        fullResponse += chunk;
        const wordCount = fullResponse.trim().split(/\s+/).filter(word => word.length > 0).length;
        tokenCount = Math.max(1, Math.ceil(wordCount * 1.33));

        const duration = (Date.now() - startTime) / 1000;
        let avgTokenTime = undefined;

        if (firstTokenTime !== null && tokenCount > 0) {
          const timeAfterFirstToken = Date.now() - (startTime + firstTokenTime);
          avgTokenTime = timeAfterFirstToken / tokenCount;
        }

        this.callbacks.setStreamingMessage(fullResponse);
        this.callbacks.setStreamingStats({
          tokens: tokenCount,
          duration,
          firstTokenTime: firstTokenTime || undefined,
          avgTokenTime: avgTokenTime && avgTokenTime > 0 ? avgTokenTime : undefined,
        });

        updateCounter++;
        if (
          updateCounter % 10 === 0 ||
          fullResponse.endsWith('.') ||
          fullResponse.endsWith('!') ||
          fullResponse.endsWith('?')
        ) {
          let debouncedAvgTokenTime = undefined;
          if (firstTokenTime !== null && tokenCount > 0) {
            const timeAfterFirstToken = Date.now() - (startTime + firstTokenTime);
            debouncedAvgTokenTime = timeAfterFirstToken / tokenCount;
          }

          const finalMessage: ChatMessage = {
            ...assistantMessage,
            content: fullResponse,
            stats: {
              duration,
              tokens: tokenCount,
              firstTokenTime: firstTokenTime || undefined,
              avgTokenTime: debouncedAvgTokenTime && debouncedAvgTokenTime > 0 ? debouncedAvgTokenTime : undefined,
            },
          };

          const finalMessages = [...newMessages, finalMessage];
          this.callbacks.setMessages(finalMessages);
        }
      }

    } catch (error) {
      appleFoundationService.cancel();
      const duration = (Date.now() - startTime) / 1000;
      this.callbacks.setStreamingMessage('');
      this.callbacks.setStreamingStats(null);
      const message = error instanceof Error ? error.message : String(error);
      const normalized = message.toLowerCase();
      let displayMessage = 'Apple Intelligence not available on this device.';
      if (normalized.includes('disabled')) {
        displayMessage = 'Apple Intelligence is disabled. Enable it in Settings to continue.';
      } else if (!normalized.includes('not available')) {
        displayMessage = `Apple Intelligence error: ${message}`;
      }
      const errorMessage: ChatMessage = {
        ...assistantMessage,
        content: displayMessage,
        stats: {
          duration,
          tokens: 0,
        },
      };
      const finalMessages = [...newMessages, errorMessage];
      this.callbacks.setMessages(finalMessages);
      return;
    }

    if (!this.cancelGenerationRef.current) {
      const duration = (Date.now() - startTime) / 1000;
      let finalAvgTokenTime = undefined;
      if (firstTokenTime !== null && tokenCount > 0) {
        const timeAfterFirstToken = Date.now() - (startTime + firstTokenTime);
        finalAvgTokenTime = timeAfterFirstToken / tokenCount;
      }

      const finalMessage: ChatMessage = {
        ...assistantMessage,
        content: fullResponse,
        stats: {
          duration,
          tokens: tokenCount,
          firstTokenTime: firstTokenTime || undefined,
          avgTokenTime: finalAvgTokenTime && finalAvgTokenTime > 0 ? finalAvgTokenTime : undefined,
        },
      };

      const finalMessages = [...newMessages, finalMessage];
      this.callbacks.setMessages(finalMessages);
    }
  }

  private async processLocalRegeneration(
    newMessages: ChatMessage[],
    settings: any,
    assistantMessage: ChatMessage,
    startTime: number,
    tokenCount: number,
    fullResponse: string,
    thinking: string,
    isThinking: boolean,
    firstTokenTime: number | null
  ): Promise<void> {
    await llamaManager.generateResponse(
      [...newMessages].map(msg => ({ role: msg.role, content: msg.content })),
      (token) => {
        if (this.cancelGenerationRef.current) {
          return false;
        }
        
        if (token.includes('<think>')) {
          isThinking = true;
          return true;
        }
        if (token.includes('</think>')) {
          isThinking = false;
          return true;
        }
        
        const currentTime = Date.now();
        
        if (firstTokenTime === null && !isThinking && token.trim().length > 0) {
          firstTokenTime = currentTime - startTime;
        }
        
        tokenCount++;
        if (isThinking) {
          thinking += token;
          this.callbacks.setStreamingThinking(thinking.trim());
        } else {
          fullResponse += token;
          this.callbacks.setStreamingMessage(fullResponse);
        }
        
        const duration = (currentTime - startTime) / 1000;
        let avgTokenTime = undefined;
        
        if (firstTokenTime !== null && tokenCount > 0 && !isThinking) {
          const timeAfterFirstToken = currentTime - (startTime + firstTokenTime);
          avgTokenTime = timeAfterFirstToken / Math.max(1, tokenCount);
        }
        
        this.callbacks.setStreamingStats({
          tokens: tokenCount,
          duration: duration,
          firstTokenTime: firstTokenTime || undefined,
          avgTokenTime: avgTokenTime && avgTokenTime > 0 ? avgTokenTime : undefined
        });
        
        if (tokenCount % 10 === 0) {
          let debouncedAvgTokenTime = undefined;
          if (firstTokenTime !== null && tokenCount > 0) {
            const timeAfterFirstToken = Date.now() - (startTime + firstTokenTime);
            debouncedAvgTokenTime = timeAfterFirstToken / Math.max(1, tokenCount);
          }
          
          const finalMessage: ChatMessage = {
            ...assistantMessage,
            content: fullResponse,
            stats: {
              duration: (Date.now() - startTime) / 1000,
              tokens: tokenCount,
              firstTokenTime: firstTokenTime || undefined,
              avgTokenTime: debouncedAvgTokenTime && debouncedAvgTokenTime > 0 ? debouncedAvgTokenTime : undefined
            }
          };
          
          const finalMessages = [...newMessages, finalMessage];
          this.callbacks.setMessages(finalMessages);
        }
        
        return !this.cancelGenerationRef.current;
      },
      settings
    );
    
    if (!this.cancelGenerationRef.current) {
      let finalAvgTokenTime = undefined;
      if (firstTokenTime !== null && tokenCount > 0) {
        const timeAfterFirstToken = Date.now() - (startTime + firstTokenTime);
        finalAvgTokenTime = timeAfterFirstToken / Math.max(1, tokenCount);
      }
      
      const finalMessage: ChatMessage = {
        id: assistantMessage.id,
        role: assistantMessage.role,
        content: fullResponse,
        stats: {
          duration: (Date.now() - startTime) / 1000,
          tokens: tokenCount,
          firstTokenTime: firstTokenTime || undefined,
          avgTokenTime: finalAvgTokenTime && finalAvgTokenTime > 0 ? finalAvgTokenTime : undefined
        }
      };
      
      const finalMessages = [...newMessages, finalMessage];
      this.callbacks.setMessages(finalMessages);
      this.callbacks.saveMessagesDebounced.cancel();
      await this.callbacks.saveMessagesImmediate(finalMessages);
    }
  }

  private getProviderDisplayName(provider: string): 'Gemini' | 'OpenAI' | 'DeepSeek' | 'Claude' {
    switch (provider) {
      case 'gemini': return 'Gemini';
      case 'chatgpt': return 'OpenAI';
      case 'deepseek': return 'DeepSeek';
      case 'claude': return 'Claude';
      default: return 'OpenAI';
    }
  }
}
