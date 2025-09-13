import { ChatMessage } from '../utils/ChatManager';
import { llamaManager } from '../utils/LlamaManager';
import { onlineModelService } from './OnlineModelService';
import chatManager from '../utils/ChatManager';
import { generateRandomId } from '../utils/homeScreenUtils';

export interface MessageProcessingCallbacks {
  setStreamingMessageId: (id: string | null) => void;
  setStreamingMessage: (message: string) => void;
  setStreamingThinking: (thinking: string) => void;
  setStreamingStats: (stats: { tokens: number; duration: number; firstTokenTime?: number; avgTokenTime?: number } | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  setIsRegenerating: (regenerating: boolean) => void;
  updateMessageContentDebounced: (messageId: string, content: string, thinking: string, stats: any) => void;
  handleApiError: (error: unknown, provider: 'Gemini' | 'OpenAI' | 'DeepSeek' | 'Claude') => void;
}

export class MessageProcessingService {
  private cancelGenerationRef: React.MutableRefObject<boolean>;
  private callbacks: MessageProcessingCallbacks;

  constructor(cancelGenerationRef: React.MutableRefObject<boolean>, callbacks: MessageProcessingCallbacks) {
    this.cancelGenerationRef = cancelGenerationRef;
    this.callbacks = callbacks;
  }

  async processMessage(
    activeProvider: 'local' | 'gemini' | 'chatgpt' | 'deepseek' | 'claude' | null,
    settings: any
  ): Promise<void> {
    const currentChat = chatManager.getCurrentChat();
    if (!currentChat) return;

    try {
      this.callbacks.setIsRegenerating(true);
      
      const currentMessages = currentChat.messages;
      const isOnlineModel = activeProvider && activeProvider !== 'local';
      
      const processedMessages = currentMessages.some(msg => msg.role === 'system')
        ? currentMessages
        : [{ role: 'system', content: settings.systemPrompt, id: 'system-prompt' }, ...currentMessages];
      
      const assistantMessage: Omit<ChatMessage, 'id'> = {
        role: 'assistant',
        content: '',
        stats: {
          duration: 0,
          tokens: 0,
        }
      };
      
      await chatManager.addMessage(assistantMessage);
      const lastMessage = chatManager.getCurrentChat()?.messages.slice(-1)[0];
      if (!lastMessage) return;
      
      const messageId = lastMessage.id;
      
      this.callbacks.setStreamingMessageId(messageId);
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
      this.cancelGenerationRef.current = false;
      
      let updateCounter = 0;

      if (isOnlineModel) {
        await this.processOnlineModel(
          activeProvider,
          processedMessages,
          settings,
          messageId,
          startTime,
          tokenCount,
          fullResponse,
          firstTokenTime,
          updateCounter
        );
      } else {
        await this.processLocalModel(
          processedMessages,
          settings,
          messageId,
          startTime,
          tokenCount,
          fullResponse,
          thinking,
          isThinking,
          firstTokenTime,
          updateCounter
        );
      }
      
      this.callbacks.setIsStreaming(false);
      this.callbacks.setStreamingMessageId(null);
      this.callbacks.setStreamingThinking('');
      this.callbacks.setStreamingStats(null);
      this.callbacks.setIsRegenerating(false);
      
    } catch (error) {
      this.callbacks.setIsStreaming(false);
      this.callbacks.setStreamingMessageId(null);
      this.callbacks.setStreamingThinking('');
      this.callbacks.setStreamingStats(null);
      this.callbacks.setIsRegenerating(false);
      throw error;
    }
  }

  private async processOnlineModel(
    activeProvider: 'gemini' | 'chatgpt' | 'deepseek' | 'claude',
    processedMessages: any[],
    settings: any,
    messageId: string,
    startTime: number,
    tokenCount: number,
    fullResponse: string,
    firstTokenTime: number | null,
    updateCounter: number
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
      
      updateCounter++;
      if (updateCounter % 10 === 0 || 
          partialResponse.endsWith('.') || 
          partialResponse.endsWith('!') || 
          partialResponse.endsWith('?')) {
        let debouncedAvgTokenTime = undefined;
        if (firstTokenTime !== null && tokenCount > 0) {
          const timeAfterFirstToken = Date.now() - (startTime + firstTokenTime);
          debouncedAvgTokenTime = timeAfterFirstToken / tokenCount;
        }
        
        this.callbacks.updateMessageContentDebounced(
          messageId,
          partialResponse,
          '',
          {
            duration: (Date.now() - startTime) / 1000,
            tokens: tokenCount,
            firstTokenTime: firstTokenTime || undefined,
            avgTokenTime: debouncedAvgTokenTime && debouncedAvgTokenTime > 0 ? debouncedAvgTokenTime : undefined
          }
        );
      }
      
      return !this.cancelGenerationRef.current;
    };

    const messageParams = [...processedMessages]
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
      switch (activeProvider) {
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
          await chatManager.updateMessageContent(
            messageId,
            `This model provider (${activeProvider}) is not yet implemented.`,
            '',
            { duration: 0, tokens: 0 }
          );
          return;
      }
      
      if (!this.cancelGenerationRef.current) {
        let finalAvgTokenTime = undefined;
        if (firstTokenTime !== null && tokenCount > 0) {
          const timeAfterFirstToken = Date.now() - (startTime + firstTokenTime);
          finalAvgTokenTime = timeAfterFirstToken / tokenCount;
        }
        
        await chatManager.updateMessageContent(
          messageId,
          fullResponse,
          '',
          {
            duration: (Date.now() - startTime) / 1000,
            tokens: tokenCount,
            firstTokenTime: firstTokenTime || undefined,
            avgTokenTime: finalAvgTokenTime && finalAvgTokenTime > 0 ? finalAvgTokenTime : undefined
          }
        );
      }
    } catch (error) {
      this.callbacks.handleApiError(error, this.getProviderDisplayName(activeProvider));
      
      await chatManager.updateMessageContent(
        messageId,
        'Sorry, an error occurred while generating a response. Please try again.',
        '',
        { duration: 0, tokens: 0 }
      );
    }
  }

  private async processLocalModel(
    processedMessages: any[],
    settings: any,
    messageId: string,
    startTime: number,
    tokenCount: number,
    fullResponse: string,
    thinking: string,
    isThinking: boolean,
    firstTokenTime: number | null,
    updateCounter: number
  ): Promise<void> {
    await llamaManager.generateResponse(
      processedMessages.map(msg => ({ role: msg.role, content: msg.content })),
      (token) => {
        if (this.cancelGenerationRef.current) {
          return false;
        }
        
        if (firstTokenTime === null && !isThinking && token.trim().length > 0 && !token.includes('<think>') && !token.includes('</think>')) {
          firstTokenTime = Date.now() - startTime;
        }
        
        if (token.includes('<think>')) {
          isThinking = true;
          return true;
        }
        if (token.includes('</think>')) {
          isThinking = false;
          return true;
        }
        
        tokenCount++;
        if (isThinking) {
          thinking += token;
          this.callbacks.setStreamingThinking(thinking.trim());
        } else {
          fullResponse += token;
          this.callbacks.setStreamingMessage(fullResponse);
        }
        
        const duration = (Date.now() - startTime) / 1000;
        let avgTokenTime = undefined;
        
        if (firstTokenTime !== null && tokenCount > 0) {
          const timeAfterFirstToken = Date.now() - (startTime + firstTokenTime);
          avgTokenTime = timeAfterFirstToken / tokenCount;
        }
        
        this.callbacks.setStreamingStats({
          tokens: tokenCount,
          duration: duration,
          firstTokenTime: firstTokenTime || undefined,
          avgTokenTime: avgTokenTime && avgTokenTime > 0 ? avgTokenTime : undefined
        });
        
        updateCounter++;
        if (updateCounter % 20 === 0) {
          let debouncedAvgTokenTime = undefined;
          if (firstTokenTime !== null && tokenCount > 0) {
            const timeAfterFirstToken = Date.now() - (startTime + firstTokenTime);
            debouncedAvgTokenTime = timeAfterFirstToken / tokenCount;
          }
          
          this.callbacks.updateMessageContentDebounced(
            messageId,
            fullResponse,
            thinking.trim(),
            {
              duration: (Date.now() - startTime) / 1000,
              tokens: tokenCount,
              firstTokenTime: firstTokenTime || undefined,
              avgTokenTime: debouncedAvgTokenTime && debouncedAvgTokenTime > 0 ? debouncedAvgTokenTime : undefined
            }
          );
        }
        
        return !this.cancelGenerationRef.current;
      },
      settings
    );

    if (!this.cancelGenerationRef.current) {
      let finalAvgTokenTime = undefined;
      if (firstTokenTime !== null && tokenCount > 0) {
        const timeAfterFirstToken = Date.now() - (startTime + firstTokenTime);
        finalAvgTokenTime = timeAfterFirstToken / tokenCount;
      }
      
      await chatManager.updateMessageContent(
        messageId,
        fullResponse,
        thinking.trim(),
        {
          duration: (Date.now() - startTime) / 1000,
          tokens: tokenCount,
          firstTokenTime: firstTokenTime || undefined,
          avgTokenTime: finalAvgTokenTime && finalAvgTokenTime > 0 ? finalAvgTokenTime : undefined
        }
      );
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
