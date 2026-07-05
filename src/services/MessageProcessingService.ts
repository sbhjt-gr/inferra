import { ChatMessage } from '../utils/ChatManager';
import { engineService } from './runtime-service';
import { litertManager } from '../managers/litert-manager';
import { onlineModelService, OnlineModelService } from './OnlineModelService';
import chatManager from '../utils/ChatManager';
import { generateRandomId } from '../utils/homeScreenUtils';
import { appleFoundationService } from './AppleFoundationService';
import type { ProviderType } from './ModelManagementService';
import { RAGService } from './rag/RAGService';
import type { Message as RAGMessage } from 'react-native-rag';
import { ThinkTagParser } from '../utils/thinkTagParser';
import { skillActivityAdapter } from './adapters/SkillActivityAdapter';
import { skillToolLoopService } from './SkillToolLoopService';
import { skillManager } from './SkillManager';
import { isAgentSkillsPrompt, extractUserBasePrompt } from '../constants/agentSkillsPrompt';
import { skillsFlowService } from './SkillsFlowService';
import { buildCatalogAnswer, isCapabilityQuestion, skillContextService } from './SkillContextService';

export interface MessageProcessingCallbacks {
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
  updateMessageContentDebounced: (messageId: string, content: string, thinking: string, stats: any) => void;
  handleApiError: (error: unknown, provider: 'Gemini' | 'OpenAI' | 'Claude') => void;
}

export class MessageProcessingService {
  private cancelGenerationRef: React.MutableRefObject<boolean>;
  private callbacks: MessageProcessingCallbacks;

  constructor(cancelGenerationRef: React.MutableRefObject<boolean>, callbacks: MessageProcessingCallbacks) {
    this.cancelGenerationRef = cancelGenerationRef;
    this.callbacks = callbacks;
  }

  private async persistSkillSteps(messageId: string): Promise<void> {
    const steps = skillActivityAdapter.snapshot();
    if (steps.length === 0) {
      return;
    }
    const chat = chatManager.getCurrentChat();
    if (!chat) {
      return;
    }
    const message = chat.messages.find(item => item.id === messageId);
    if (!message) {
      return;
    }
    await chatManager.updateMessageContent(
      messageId,
      message.content,
      message.thinking,
      message.stats,
      steps,
    );
    const updated = chatManager.getCurrentChat();
    if (updated) {
      this.callbacks.setMessages([...updated.messages]);
    }
  }

  async processMessage(
    activeProvider: ProviderType | null,
    settings: any
  ): Promise<void> {
    const currentChat = chatManager.getCurrentChat();
    if (!currentChat) return;

    console.log('process_message_start', { provider: activeProvider, chatId: currentChat.id, messageCount: currentChat.messages.length });

    let activeMessageId: string | null = null;

    try {
      skillActivityAdapter.clear();
      this.callbacks.setIsRegenerating(true);
      
      const currentMessages = currentChat.messages;
      const isOnlineModel = !!activeProvider && ['gemini','chatgpt','claude'].includes(OnlineModelService.getBaseProvider(activeProvider));
      const isAppleFoundation = activeProvider === 'apple-foundation';

      await skillManager.syncTools();

      const rawBase = extractUserBasePrompt(settings.systemPrompt);
      const systemPrompt = await skillManager.buildSystemPrompt(rawBase);
      settings = { ...settings, systemPrompt };

      const nonSystem = currentMessages.filter(msg => msg.role !== 'system');
      const processedMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt, id: 'system-prompt' }, ...nonSystem]
        : nonSystem;
      const skipRag = this.shouldSkipRag(processedMessages) || await this.shouldSkipRagForInput(processedMessages);
      const responderModelName = await this.resolveResponderModelName(activeProvider);
      if (responderModelName) {
        console.log('resp_model', responderModelName);
      }
      
      const assistantMessage: Omit<ChatMessage, 'id'> = {
        role: 'assistant',
        content: '',
        modelName: responderModelName,
        stats: {
          duration: 0,
          tokens: 0,
        }
      };
      
      await chatManager.addMessage(assistantMessage);
      const updatedChat = chatManager.getCurrentChat();
      if (!updatedChat) return;

      this.callbacks.setMessages([...updatedChat.messages]);

      const lastMessage = updatedChat.messages.slice(-1)[0];
      if (!lastMessage) return;
      
      const messageId = lastMessage.id;
      activeMessageId = messageId;
      
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
      } else if (isAppleFoundation) {
        await this.processAppleFoundationModel(
          processedMessages,
          settings,
          messageId,
          startTime,
          skipRag
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
          updateCounter,
          skipRag
        );
      }
      
      if (!this.cancelGenerationRef.current) {
        await this.persistSkillSteps(messageId);
        this.callbacks.setIsStreaming(false);
        this.callbacks.setStreamingMessageId(null);
        this.callbacks.setStreamingThinking('');
        this.callbacks.setStreamingStats(null);
        this.callbacks.setIsRegenerating(false);
        skillActivityAdapter.clear();
      }
      
    } catch (error) {
      if (!this.cancelGenerationRef.current) {
        if (activeMessageId) {
          await chatManager.removeMessage(currentChat.id, activeMessageId);
          const updatedChat = chatManager.getCurrentChat();
          if (updatedChat) {
            this.callbacks.setMessages([...updatedChat.messages]);
          }
        }
        skillActivityAdapter.clear();
        this.callbacks.setIsStreaming(false);
        this.callbacks.setStreamingMessageId(null);
        this.callbacks.setStreamingThinking('');
        this.callbacks.setStreamingStats(null);
        this.callbacks.setIsRegenerating(false);
      }
      throw error;
    }
  }

  private async processOnlineModel(
    activeProvider: string,
    processedMessages: any[],
    settings: any,
    messageId: string,
    startTime: number,
    tokenCount: number,
    fullResponse: string,
    firstTokenTime: number | null,
    updateCounter: number
  ): Promise<void> {
    const thinkParser = new ThinkTagParser();
    let thinking = '';
    let isThinking = false;

    const streamCallback = (token: string) => {
      if (this.cancelGenerationRef.current) {
        return false;
      }

      const chunks = thinkParser.feed(token);

      for (const chunk of chunks) {
        if (chunk.type === 'open') {
          isThinking = true;
          continue;
        }
        if (chunk.type === 'close') {
          isThinking = false;
          continue;
        }

        if (isThinking) {
          thinking += chunk.text;
          this.callbacks.setStreamingThinking(thinking.trim());
          if (settings.includeThinkingTokens) {
            const t = Date.now();
            if (firstTokenTime === null && chunk.text.trim().length > 0) {
              firstTokenTime = t - startTime;
            }
            tokenCount++;
          }
          continue;
        }

        const currentTime = Date.now();

        if (firstTokenTime === null && chunk.text.trim().length > 0) {
          firstTokenTime = currentTime - startTime;
        }

        tokenCount++;
        fullResponse += chunk.text;
      }

      const nowTime = Date.now();
      const duration = (nowTime - startTime) / 1000;
      let avgTokenTime = undefined;

      if (firstTokenTime !== null && tokenCount > 0) {
        const timeAfterFirstToken = nowTime - (startTime + firstTokenTime);
        avgTokenTime = timeAfterFirstToken / tokenCount;
      }

      this.callbacks.setStreamingMessage(fullResponse);
      this.callbacks.setStreamingStats({
        tokens: tokenCount,
        duration: duration,
        firstTokenTime: firstTokenTime || undefined,
        avgTokenTime: avgTokenTime && avgTokenTime > 0 ? avgTokenTime : undefined
      });

      updateCounter++;
      if (updateCounter % 10 === 0 ||
          fullResponse.endsWith('.') ||
          fullResponse.endsWith('!') ||
          fullResponse.endsWith('?')) {
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
    };

    const baseMessages = processedMessages.map(msg => {
      let content = msg.content;
      
      try {
        const parsed = JSON.parse(msg.content);
        
        if (parsed && parsed.type === 'ocr_result') {
          if (parsed.metadata?.ragDocumentId) {
            const fileName = parsed.fileName ? ` from ${parsed.fileName}` : '';
            const userPrompt = parsed.userPrompt || 'Please process this extracted text';
            content = `User uploaded an image${fileName} and extracted text from it. The text has been stored for retrieval.\n\nUser request: ${userPrompt}`;
          } else {
            const instruction = parsed.internalInstruction || '';
            const userPrompt = parsed.userPrompt || '';
            content = `${instruction}\n\nUser request: ${userPrompt}`;
          }
        } else if (parsed && parsed.type === 'file_upload') {
          if (parsed.metadata?.openaiFileId) {
            const fileName = parsed.fileName || 'a file';
            const userContent = parsed.userContent || `File uploaded: ${fileName}`;
            content = `[File: ${fileName} (id: ${parsed.metadata.openaiFileId})]\n\n${userContent}`;
          } else if (parsed.metadata?.ragDocumentId) {
            const fileName = parsed.fileName || 'a file';
            const userContent = parsed.userContent || `File uploaded: ${fileName}`;
            content = `User uploaded ${fileName}. The content has been stored for retrieval.\n\nUser request: ${userContent}`;
          } else if (parsed.metadata?.remoteFileUri) {
            content = msg.content;
          } else {
            content = parsed.internalInstruction || msg.content;
          }
        }
      } catch {
      }
      
      return { role: msg.role, content };
    }) as RAGMessage[];

    const legacyStreamCallback = (partialResponse: string) => {
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

    const messageParams = [...baseMessages]
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

    const isGemini = OnlineModelService.getBaseProvider(activeProvider) === 'gemini';
    const isOpenAI = OnlineModelService.getBaseProvider(activeProvider) === 'chatgpt';
    const isClaude = OnlineModelService.getBaseProvider(activeProvider) === 'claude';
    console.log('msgproc_provider', { activeProvider, isGemini, isOpenAI, isClaude });

    /*
      Image generation: detect explicit image generation requests for OpenAI.
      If the last user message starts with /image, route to image generation.
    */
    if (isOpenAI) {
      const lastUserMsg = baseMessages.filter(m => m.role === 'user').pop();
      if (lastUserMsg && typeof lastUserMsg.content === 'string' && lastUserMsg.content.startsWith('/image ')) {
        const prompt = lastUserMsg.content.slice(7).trim();
        if (prompt.length > 0) {
          try {
            this.callbacks.setStreamingMessage('Generating image...');
            const imageResult = await onlineModelService.generateImage(prompt, {}, activeProvider);
            const imageMsg = JSON.stringify({
              type: 'image_generation',
              prompt,
              revisedPrompt: imageResult.revisedPrompt,
              localUri: imageResult.localUri,
              url: imageResult.url,
            });
            fullResponse = imageMsg;
            await chatManager.updateMessageContent(
              messageId,
              imageMsg,
              '',
              { duration: (Date.now() - startTime) / 1000, tokens: 0 }
            );
            return;
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Image generation failed';
            fullResponse = errMsg;
            await chatManager.updateMessageContent(messageId, errMsg, '', { duration: 0, tokens: 0 });
            return;
          }
        }
      }
    }

    const lastUserText = this.getLastUserText(baseMessages);
    const skillsOn = await skillManager.isModeEnabled();
    if (skillsOn && isCapabilityQuestion(lastUserText)) {
      const catalog = await skillContextService.getCatalog();
      fullResponse = buildCatalogAnswer(lastUserText, catalog);
      this.callbacks.setStreamingMessage(fullResponse);
      console.log('online_skills_catalog', { len: fullResponse.length });
      await chatManager.updateMessageContent(
        messageId,
        fullResponse,
        thinking.trim(),
        {
          duration: (Date.now() - startTime) / 1000,
          tokens: Math.max(1, Math.ceil(fullResponse.length / 4)),
          firstTokenTime: firstTokenTime || undefined,
        },
      );
      return;
    }

    try {
      console.log('msgproc_send_plain', { provider: activeProvider, msgCount: messageParams.length });
      await onlineModelService.sendMessage(activeProvider, messageParams, apiParams, legacyStreamCallback);
    } catch (error) {
      console.log('online_model_error', error instanceof Error ? error.message : 'unknown');
      console.log('online_model_error_stack', error instanceof Error ? error.stack : '');
      if (this.callbacks.handleApiError) {
        this.callbacks.handleApiError(error, this.getProviderDisplayName(activeProvider));
      }
      
      await chatManager.updateMessageContent(
        messageId,
        'Sorry, an error occurred while generating a response. Please try again.',
        '',
        { duration: 0, tokens: 0 }
      );
      return;
    }
    
    if (skillsOn && !this.cancelGenerationRef.current) {
      const skillResult = await skillToolLoopService.followUpFromResponse(
        activeProvider,
        messageParams,
        fullResponse,
        {
          settings,
          shouldCancel: () => this.cancelGenerationRef.current,
          onToolRound: () => {
            fullResponse = '';
            thinking = '';
            this.callbacks.setStreamingMessage('');
            this.callbacks.setStreamingThinking('');
          },
          onToken: streamCallback,
        },
      );
      if (skillResult) {
        fullResponse = skillResult;
        this.callbacks.setStreamingMessage(fullResponse);
      }
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

  private async processAppleFoundationModel(
    processedMessages: any[],
    settings: any,
    messageId: string,
    startTime: number,
    skipRag: boolean
  ): Promise<void> {
    let fullResponse = '';
    let tokenCount = 0;
    let firstTokenTime: number | null = null;
    let updateCounter = 0;

    const streamCallback = (token: string) => {
      if (this.cancelGenerationRef.current) {
        return false;
      }

      if (firstTokenTime === null && token.trim().length > 0) {
        firstTokenTime = Date.now() - startTime;
      }

      fullResponse += token;
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

        this.callbacks.updateMessageContentDebounced(
          messageId,
          fullResponse,
          '',
          {
            duration,
            tokens: tokenCount,
            firstTokenTime: firstTokenTime || undefined,
            avgTokenTime: debouncedAvgTokenTime && debouncedAvgTokenTime > 0 ? debouncedAvgTokenTime : undefined,
          }
        );
      }

      return !this.cancelGenerationRef.current;
    };

    const baseMessages = processedMessages.map(msg => {
      let content = msg.content;
      
      try {
        const parsed = JSON.parse(msg.content);
        
        if (parsed && parsed.type === 'ocr_result') {
          if (parsed.metadata?.ragDocumentId) {
            const fileName = parsed.fileName ? ` from ${parsed.fileName}` : '';
            const userPrompt = parsed.userPrompt || 'Please process this extracted text';
            content = `User uploaded an image${fileName} and extracted text from it. The text has been stored for retrieval.\n\nUser request: ${userPrompt}`;
          } else {
            const instruction = parsed.internalInstruction || '';
            const userPrompt = parsed.userPrompt || '';
            content = instruction + (userPrompt ? `\n\n${userPrompt}` : '');
          }
        } else if (parsed && parsed.type === 'file_upload') {
          if (parsed.metadata?.ragDocumentId) {
            const fileName = parsed.fileName || 'a file';
            const userContent = parsed.userContent || `File uploaded: ${fileName}`;
            content = `User uploaded ${fileName}. The content has been stored for retrieval.\n\nUser request: ${userContent}`;
          } else {
            const instruction = parsed.internalInstruction || '';
            const userContent = parsed.userContent || '';
            content = instruction + (userContent ? `\n\n${userContent}` : '');
          }
        }
      } catch {
      }
      
      return { role: msg.role, content };
    }) as RAGMessage[];

    let usedRAG = false;
    const chatId = chatManager.getCurrentChatId();

    if (!skipRag) {
      try {
        const ragEnabled = await RAGService.isEnabled();
        if (ragEnabled) {
          if (!RAGService.isReady()) {
            await RAGService.initialize('apple-foundation');
          }
          if (RAGService.isReady()) {
            await RAGService.generate({
              input: baseMessages,
              settings,
              callback: streamCallback,
              scope: {
                chatId,
                provider: 'apple-foundation',
              },
            });
            usedRAG = true;
          }
        }
      } catch (error) {
        console.log('apple_rag_error', error instanceof Error ? error.message : 'unknown');
        usedRAG = false;
      }
    }

    if (!usedRAG) {
      const lastUserText = this.getLastUserText(baseMessages);
      const appleGen = async (
        prompt: string,
        extra?: { reuseSession?: boolean; onToken?: (token: string) => boolean | void },
      ) => {
        const out = await appleFoundationService.generateResponse(
          [{ role: 'user', content: prompt }],
          {
            temperature: settings.temperature,
            maxTokens: extra?.onToken
              ? Math.min(settings.maxTokens || 1024, 1024)
              : Math.min(settings.maxTokens || 256, 256),
            topP: settings.topP,
          },
        );
        if (extra?.onToken) {
          extra.onToken(out);
        }
        return out;
      };

      const flow = await skillsFlowService.run({
        userText: lastUserText,
        settings,
        onToken: streamCallback,
        genText: appleGen,
      });

      let flowHandled = false;
      if (flow.handled && flow.text && !this.cancelGenerationRef.current) {
        fullResponse = flow.text;
        tokenCount = Math.max(1, Math.ceil(fullResponse.length / 4));
        this.callbacks.setStreamingMessage(fullResponse);
        flowHandled = true;
        console.log('apple_skills_flow', { len: fullResponse.length });
      }

      if (!flowHandled) {
        try {
          const stream = appleFoundationService.streamResponse(
            baseMessages.map(msg => ({ role: msg.role, content: msg.content })),
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

              this.callbacks.updateMessageContentDebounced(
                messageId,
                fullResponse,
                '',
                {
                  duration,
                  tokens: tokenCount,
                  firstTokenTime: firstTokenTime || undefined,
                  avgTokenTime: debouncedAvgTokenTime && debouncedAvgTokenTime > 0 ? debouncedAvgTokenTime : undefined,
                }
              );
            }
          }
        } catch (error) {
          appleFoundationService.cancel();
          const message = error instanceof Error ? error.message : String(error);
          console.log('apple_intelligence_error', message);
          const normalized = message.toLowerCase();
          let displayMessage = 'Apple Intelligence not available on this device.';
          if (normalized.includes('disabled')) {
            displayMessage = 'Apple Intelligence is disabled. Enable it in Settings to continue.';
          } else if (normalized.includes('locale') || normalized.includes('language')) {
            displayMessage = 'Apple Intelligence language/locale not supported. Try using English locale.';
          } else if (!normalized.includes('not available')) {
            displayMessage = 'Apple Intelligence encountered an error. Please try again.';
          }
          await chatManager.updateMessageContent(
            messageId,
            displayMessage,
            '',
            { duration: 0, tokens: 0 }
          );
          return;
        }

        const skillsOn = await skillManager.isModeEnabled();
        if (skillsOn && !this.cancelGenerationRef.current && fullResponse) {
          const skillResult = await skillToolLoopService.followUpFromResponse(
            'apple-foundation',
            baseMessages,
            fullResponse,
            {
              settings,
              shouldCancel: () => this.cancelGenerationRef.current,
              onToolRound: () => {
                fullResponse = '';
                this.callbacks.setStreamingMessage('');
              },
              onToken: (token: string) => {
                if (this.cancelGenerationRef.current) {
                  return false;
                }
                if (firstTokenTime === null && token.trim().length > 0) {
                  firstTokenTime = Date.now() - startTime;
                }
                fullResponse += token;
                this.callbacks.setStreamingMessage(fullResponse);
                return true;
              },
            },
          );
          if (skillResult) {
            fullResponse = skillResult;
          }
        }
      }
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
          avgTokenTime: finalAvgTokenTime && finalAvgTokenTime > 0 ? finalAvgTokenTime : undefined,
        }
      );
    }
  }

  private async processLocalModel(
    processedMessages: any[],
    settings: any,
    messageId: string,
    startTime: number,
    _tokenCount: number,
    _fullResponse: string,
    _thinking: string,
    _isThinking: boolean,
    _firstTokenTime: number | null,
    _updateCounter: number,
    skipRag: boolean
  ): Promise<void> {
    let tokenCount = 0;
    let fullResponse = '';
    let thinking = '';
    let isThinking = false;
    let firstTokenTime: number | null = null;
    let updateCounter = 0;

    console.log('local_model_start', { messageId, skipRag, msgCount: processedMessages.length });
    console.log('local_model_settings', { systemPrompt: settings.systemPrompt, temperature: settings.temperature, maxTokens: settings.maxTokens });

    const thinkParser = new ThinkTagParser();

    const streamCallback = (token: string) => {
      if (this.cancelGenerationRef.current) {
        console.log('local_stream_cancelled');
        return false;
      }

      const chunks = thinkParser.feed(token);

      for (const chunk of chunks) {
        if (chunk.type === 'open') {
          isThinking = true;
          console.log('local_thinking_start');
          continue;
        }
        if (chunk.type === 'close') {
          isThinking = false;
          console.log('local_thinking_end', { thinkingLength: thinking.length });
          continue;
        }

        if (tokenCount <= 5 || tokenCount % 50 === 0) {
          console.log(`local_token[${tokenCount}]`, JSON.stringify(chunk.text), { isThinking });
        }

        if (firstTokenTime === null && (!isThinking || settings.includeThinkingTokens) && chunk.text.trim().length > 0) {
          firstTokenTime = Date.now() - startTime;
        }

        if (isThinking) {
          thinking += chunk.text;
          this.callbacks.setStreamingThinking(thinking.trim());
          if (settings.includeThinkingTokens) {
            tokenCount++;
          }
        } else {
          tokenCount++;
          fullResponse += chunk.text;
          this.callbacks.setStreamingMessage(fullResponse);
        }
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
    };

  const baseMessages = processedMessages.map(msg => {
      let content = msg.content;
      
      try {
        const parsed = JSON.parse(msg.content);
        
        if (parsed && parsed.type === 'ocr_result') {
          if (parsed.metadata?.ragDocumentId) {
            const fileName = parsed.fileName ? ` from ${parsed.fileName}` : '';
            const userPrompt = parsed.userPrompt || 'Please process this extracted text';
            content = `User uploaded an image${fileName} and extracted text from it. The text has been stored for retrieval.\n\nUser request: ${userPrompt}`;
          } else {
            const instruction = parsed.internalInstruction || '';
            const userPrompt = parsed.userPrompt || '';
            content = instruction + (userPrompt ? `\n\n${userPrompt}` : '');
          }
        } else if (parsed && parsed.type === 'file_upload') {
          if (parsed.metadata?.ragDocumentId) {
            const fileName = parsed.fileName || 'a file';
            const userContent = parsed.userContent || `File uploaded: ${fileName}`;
            content = `User uploaded ${fileName}. The content has been stored for retrieval.\n\nUser request: ${userContent}`;
          } else {
            const instruction = parsed.internalInstruction || '';
            const userContent = parsed.userContent || '';
            content = instruction + (userContent ? `\n\n${userContent}` : '');
          }
        }
      } catch {
      }
      
      return { role: msg.role, content };
    }) as RAGMessage[];

    console.log('local_base_messages_dump:');
    baseMessages.forEach((msg, i) => {
      console.log(`  base[${i}:${msg.role}] ${msg.content}`);
    });

    let usedRAG = false;
    const chatId = chatManager.getCurrentChatId();

    if (!skipRag) {
      try {
        const ragEnabled = await RAGService.isEnabled();
        if (ragEnabled && engineService.mgr().ready()) {
          if (!RAGService.isReady()) {
            await RAGService.initialize('local');
          }
          if (RAGService.isReady()) {
            await RAGService.generate({
              input: baseMessages,
              settings,
              callback: streamCallback,
              scope: {
                chatId,
                provider: 'local',
              },
            });
            usedRAG = true;
          }
        }
      } catch {
        usedRAG = false;
      }
    }

    if (!usedRAG) {
      const userTurns = baseMessages.filter(msg => msg.role === 'user').length;
      let genSettings = settings;
      let genMessages = baseMessages;
      const skillsOn = await skillManager.isModeEnabled();
      const lastUserText = this.getLastUserText(baseMessages);

      const localGen = async (
        prompt: string,
        extra?: { reuseSession?: boolean; onToken?: (token: string) => boolean | void },
      ) => {
        return engineService.mgr().gen(
          [{ role: 'user', content: prompt }] as any,
          {
            onToken: extra?.onToken,
            reuseSession: extra?.reuseSession,
            settings: {
              ...genSettings,
              systemPrompt: extra?.reuseSession ? genSettings.systemPrompt : '',
              maxTokens: extra?.reuseSession
                ? Math.min(genSettings.maxTokens || 1024, 1024)
                : Math.min(genSettings.maxTokens || 256, 256),
              temperature: extra?.reuseSession ? genSettings.temperature : 0.2,
            },
          },
        );
      };

      let skillHeader: string | undefined;
      if (skillsOn && lastUserText) {
        const flow = await skillsFlowService.run({
          userText: lastUserText,
          settings: genSettings,
          onToken: streamCallback,
          genText: localGen,
        });
        skillHeader = flow.skillHeader;
        if (flow.handled && flow.text && !this.cancelGenerationRef.current) {
          fullResponse = flow.text;
          tokenCount = Math.max(1, Math.ceil(fullResponse.length / 4));
          this.callbacks.setStreamingMessage(fullResponse);
          console.log('skills_flow_handled', { len: fullResponse.length });
        } else if (!flow.handled) {
          if (userTurns > 1 && isAgentSkillsPrompt(settings.systemPrompt) && !skillsOn) {
            const chatPrompt = await skillManager.buildConversationalSystemPrompt();
            genSettings = {
              ...settings,
              systemPrompt: chatPrompt,
              maxTokens: Math.min(settings.maxTokens || 1024, 1024),
            };
            genMessages = baseMessages.map((msg, index) => {
              if (index === 0 && msg.role === 'system') {
                return { role: 'system', content: chatPrompt };
              }
              return msg;
            });
            console.log('local_chat_prompt', { userTurns, skillsOn });
          }

          console.log('local_gen_direct', { baseMessageCount: genMessages.length, userTurns, skillHeader: !!skillHeader });
          try {
            await engineService.mgr().gen(
              genMessages as any,
              {
                onToken: streamCallback,
                settings: genSettings,
                skillHeader,
              },
            );
          } catch (error) {
            console.log('local_gen_fail', error instanceof Error ? error.message : 'unknown');
            if (engineService.get() === 'litert') {
              try {
                await litertManager.recoverInvoke();
              } catch {
                console.log('local_gen_recover_fail');
              }
            }
            throw error;
          }
        }
      } else {
        console.log('local_gen_direct', { baseMessageCount: genMessages.length, userTurns });
        try {
          await engineService.mgr().gen(
            genMessages as any,
            {
              onToken: streamCallback,
              settings: genSettings,
            },
          );
        } catch (error) {
          console.log('local_gen_fail', error instanceof Error ? error.message : 'unknown');
          if (engineService.get() === 'litert') {
            try {
              await litertManager.recoverInvoke();
            } catch {
              console.log('local_gen_recover_fail');
            }
          }
          throw error;
        }
      }
    }

    console.log('local_model_done', { tokenCount, responseLength: fullResponse.length, thinkingLength: thinking.length, cancelled: this.cancelGenerationRef.current });
    console.log('local_response:', fullResponse);
    if (thinking) {
      console.log('local_thinking:', thinking);
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

  private getProviderDisplayName(provider: string): 'Gemini' | 'OpenAI' | 'Claude' {
    const base = OnlineModelService.getBaseProvider(provider);
    switch (base) {
      case 'gemini': return 'Gemini';
      case 'chatgpt': return 'OpenAI';
      case 'claude': return 'Claude';
      default: return 'OpenAI';
    }
  }

  private async resolveResponderModelName(activeProvider: ProviderType | null): Promise<string | undefined> {
    if (!activeProvider || activeProvider === 'local') {
      const activePath = engineService.getActiveModelPath();
      if (!activePath) {
        return undefined;
      }
      return this.getLocalModelName(activePath);
    }

    if (activeProvider === 'apple-foundation') {
      return 'Apple Foundation';
    }

    const configured = await onlineModelService.getModelName(activeProvider);
    if (configured && configured.trim()) {
      return configured.trim();
    }

    const fallback = onlineModelService.getDefaultModelName(activeProvider);
    if (fallback && fallback.trim()) {
      return fallback.trim();
    }

    const base = OnlineModelService.getBaseProvider(activeProvider);
    return base || undefined;
  }

  private getLastUserText(messages: Array<{ role: string; content: string }>): string {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const entry = messages[index];
      if (entry.role !== 'user') {
        continue;
      }
      const raw = entry.content;
      if (typeof raw !== 'string') {
        continue;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.type === 'multimodal' && Array.isArray(parsed.content)) {
          const textPart = parsed.content.find((item: { type?: string; text?: string }) => item?.type === 'text');
          if (textPart?.text) {
            return String(textPart.text).trim();
          }
        }
        if (typeof parsed?.userContent === 'string' && parsed.userContent.trim()) {
          return parsed.userContent.trim();
        }
        if (typeof parsed?.userPrompt === 'string' && parsed.userPrompt.trim()) {
          return parsed.userPrompt.trim();
        }
      } catch {
      }
      if (raw.trim()) {
        return raw.trim();
      }
    }
    return '';
  }

  private getLocalModelName(path: string): string {
    const file = path.split('/').pop() || path;
    return file.replace(/\.(gguf|mlx|litertlm|task)$/i, '');
  }

  private shouldSkipRag(messages: Array<{ role: string; content: string }>): boolean {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const entry = messages[index];
      if (entry.role !== 'user') {
        continue;
      }
      try {
        const parsed = JSON.parse(entry.content);
        if (parsed?.type === 'multimodal') {
          return true;
        }
        return parsed?.metadata?.ragDisabled === true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private async shouldSkipRagForInput(messages: Array<{ role: string; content: string }>): Promise<boolean> {
    let lastUserText = '';
    let isFileMessage = false;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const entry = messages[index];
      if (entry.role !== 'user') {
        continue;
      }

      try {
        const parsed = JSON.parse(entry.content);
        if (parsed?.type === 'ocr_result') {
          lastUserText = String(parsed?.userPrompt || '').trim();
          isFileMessage = true;
        } else if (parsed?.type === 'file_upload') {
          lastUserText = String(parsed?.userContent || '').trim();
          isFileMessage = true;
        } else {
          lastUserText = String(entry.content || '').trim();
        }
      } catch {
        lastUserText = String(entry.content || '').trim();
      }
      break;
    }

    const compactText = lastUserText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const tokenCount = compactText.length > 0 ? compactText.split(/\s+/).length : 0;

    if (!isFileMessage && (compactText.length <= 4 || tokenCount <= 1)) {
      return true;
    }

    if (!isFileMessage && /^(hi|hey|hello|yo|sup|hola|hii+)$/.test(compactText)) {
      return true;
    }

    try {
      const status = await RAGService.getStatus();
      if (!status.enabled || status.documentCount <= 0) {
        return true;
      }
    } catch {
      return true;
    }

    return false;
  }
}
