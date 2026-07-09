import { fs as FileSystem } from './fs';
import type { Tool, ToolCall, ToolSchema } from './tools/ToolRegistry';
import { generateRandomId } from '../utils/homeScreenUtils';

type ChatMessage = {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  thinking?: string;
  toolCallId?: string;
  stats?: {
    duration: number;
    tokens: number;
  };
};

export interface GeminiRequestOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  model?: string;
  streamTokens?: boolean;
  tools?: Tool[];
}

export type GeminiResponse = {
  fullResponse: string;
  tokenCount: number;
  startTime: number;
  toolCalls?: ToolCall[];
  rawParts?: any[];
};

export class GeminiService {
  private apiKeyProvider: (provider: string) => Promise<string | null>;
  private baseUrlProvider: (provider: string) => Promise<string>;

  constructor(
    apiKeyProvider: (provider: string) => Promise<string | null>,
    baseUrlProvider: (provider: string) => Promise<string>
  ) {
    this.apiKeyProvider = apiKeyProvider;
    this.baseUrlProvider = baseUrlProvider;
  }

  private async convertImageToBase64(imageUri: string): Promise<{ data: string; mimeType: string }> {
    try {
      const base64String = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const fileExtension = imageUri.toLowerCase().split('.').pop();
      let mimeType = 'image/jpeg';
      
      switch (fileExtension) {
        case 'png':
          mimeType = 'image/png';
          break;
        case 'webp':
          mimeType = 'image/webp';
          break;
        case 'heic':
          mimeType = 'image/heic';
          break;
        case 'heif':
          mimeType = 'image/heif';
          break;
        default:
          mimeType = 'image/jpeg';
      }
      
      return { data: base64String, mimeType };
    } catch (error) {
      throw new Error('Failed to process image for Gemini API');
    }
  }

  private toGeminiTools(tools: Tool[] = []): any[] {
    return tools
      .filter((tool): tool is ToolSchema => 'function' in tool)
      .map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      }));
  }

  private async parseMessageContent(message: ChatMessage): Promise<any[]> {
    try {
      const parsed = JSON.parse(message.content);

      if (parsed.type === 'gemini_tool_use_response' && parsed.rawParts) {
        return parsed.rawParts;
      }

      if (parsed.type === 'function_response') {
        return [{
          functionResponse: {
            name: parsed.name,
            response: parsed.response,
          },
        }];
      }
      
      if (parsed.type === 'multimodal' && parsed.content) {
        const parts: any[] = [];
        
        for (const item of parsed.content) {
          if (item.type === 'text') {
            parts.push({ text: item.text });
          } else if (item.type === 'image' && item.uri) {
            const { data, mimeType } = await this.convertImageToBase64(item.uri);
            parts.push({
              inlineData: {
                mimeType: mimeType,
                data: data
              }
            });
          }
        }
        
        return parts;
      }
      
      if (parsed.type === 'ocr_result') {
        const instruction = parsed.internalInstruction || '';
        const userPrompt = parsed.userPrompt || '';
        
        return [{ text: `${instruction}\n\nUser request: ${userPrompt}` }];
      }

      if (parsed.type === 'file_upload' && parsed.metadata?.remoteFileUri) {
        const base64 = await FileSystem.readAsStringAsync(
          parsed.metadata.remoteFileUri,
          { encoding: FileSystem.EncodingType.Base64 }
        );
        return [
          {
            inlineData: {
              mimeType: parsed.metadata.mimeType || 'application/octet-stream',
              data: base64,
            }
          },
          { text: parsed.userContent || `Analyze this file: ${parsed.fileName || 'document'}` },
        ];
      }
    } catch (error) {
    }
    
    return [{ text: message.content }];
  }

  private parseGeminiCandidate(candidate: any): {
    text: string;
    toolCalls: ToolCall[];
    rawParts: any[];
  } {
    const toolCalls: ToolCall[] = [];
    const rawParts: any[] = [];
    let text = '';
    const parts = candidate?.content?.parts || [];
    for (const part of parts) {
      rawParts.push(part);
      if (part.text) {
        text += part.text;
      }
      if (part.functionCall) {
        const id = part.functionCall.id || generateRandomId();
        toolCalls.push({
          id,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        });
      }
    }
    return { text, toolCalls, rawParts };
  }

  async generateResponse(
    messages: ChatMessage[],
    options: GeminiRequestOptions = {},
    onToken?: (token: string) => boolean | void,
    provider = 'gemini'
  ): Promise<GeminiResponse> {
    const startTime = Date.now();
    let tokenCount = 0;
    let fullResponse = '';

    try {
      const apiKey = await this.apiKeyProvider(provider);
      if (!apiKey) {
        throw new Error('Gemini API key not found. Please set it in Settings.');
      }

      const temperature = options.temperature ?? 0.7;
      const maxTokens = options.maxTokens ?? 1024;
      const topP = options.topP ?? 0.9;
      const model = options.model ?? 'gemini-2.5-flash';
      
      const shouldStream = !!onToken;
      const shouldStreamTokens = options.streamTokens ?? true;

      const userMessages = messages.filter(msg => msg.role !== 'system');
      const systemMessage = messages.find(msg => msg.role === 'system');
      
      let prompt = '';
      if (systemMessage) {
        prompt = `${systemMessage.content}\n\n`;
      }

      const formattedMessages = [];
      for (const msg of userMessages) {
        const parts = await this.parseMessageContent(msg);
        formattedMessages.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: parts
        });
      }

  const modelPath = model.startsWith('models/') ? model : `models/${model}`;
  const baseUrl = await this.baseUrlProvider(provider);
  const url = `${baseUrl}/${modelPath}:${shouldStreamTokens ? 'streamGenerateContent' : 'generateContent'}?key=${apiKey}`;

      const requestBody: any = {
        contents: formattedMessages,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP,
        }
      };
      
      if (systemMessage) {
        requestBody.systemInstruction = {
          parts: [{ text: systemMessage.content }]
        };
      }

      const geminiTools = this.toGeminiTools(options.tools);
      if (geminiTools.length > 0) {
        requestBody.tools = [{ functionDeclarations: geminiTools }];
      }

      const headers = {
        'Content-Type': 'application/json'
      };

      if (shouldStreamTokens && shouldStream && typeof onToken === 'function') {
        
        try {
          const response = await fetch(url.replace('streamGenerateContent', 'generateContent'), {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            
            if (response.status === 429 || errorText.includes("quota") || errorText.includes("rate limit")) {
              throw new Error("QUOTA_EXCEEDED: Your Gemini API quota has been exceeded. Please try again later or upgrade your API plan.");
            }
            
            if (response.status === 400) {
              if (errorText.includes("invalid")) {
                throw new Error("INVALID_REQUEST: The request to Gemini API was invalid. Please check your input and try again.");
              }
              if (errorText.includes("content filtered")) {
                throw new Error("CONTENT_FILTERED: Your request was filtered due to safety settings or content policy violations.");
              }
            }
            
            if (response.status === 401) {
              throw new Error("AUTHENTICATION_ERROR: Invalid API key or authentication error. Please check your API key in Settings.");
            }
            
            if (response.status === 403) {
              throw new Error("PERMISSION_DENIED: You don't have permission to access this Gemini model or feature.");
            }
            
            if (response.status === 404) {
              throw new Error("NOT_FOUND: The requested Gemini model or resource was not found.");
            }
            
            if (response.status === 500 || response.status === 503) {
              throw new Error("SERVER_ERROR: Gemini API is experiencing issues. Please try again later.");
            }
            
            throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
          }

          const jsonResponse = await response.json();
          
          let completeText = '';
          let totalTokens = 0;
          
          if (Array.isArray(jsonResponse)) {
            for (let i = 0; i < jsonResponse.length; i++) {
              const chunk = jsonResponse[i];
              if (chunk.candidates && chunk.candidates.length > 0 && 
                  chunk.candidates[0].content && 
                  chunk.candidates[0].content.parts) {
                
                const parts = chunk.candidates[0].content.parts;
                for (const part of parts) {
                  if (part.text) {
                    completeText += part.text;
                  }
                }
                
                if (chunk.usageMetadata && chunk.usageMetadata.totalTokenCount) {
                  totalTokens += chunk.usageMetadata.totalTokenCount;
                }
              }
            }
          } else if (jsonResponse.candidates) {
            if (jsonResponse.candidates.length > 0 && 
                jsonResponse.candidates[0].content && 
                jsonResponse.candidates[0].content.parts) {
              
              const parts = jsonResponse.candidates[0].content.parts;
              for (const part of parts) {
                if (part.text) {
                  completeText += part.text;
                }
              }
              
              if (jsonResponse.usageMetadata && jsonResponse.usageMetadata.totalTokenCount) {
                totalTokens = jsonResponse.usageMetadata.totalTokenCount;
              }
            }
          } else {
            throw new Error('Failed to extract content from Gemini API response');
          }
          
          
          const words = completeText.split(/(\s+|[,.!?;:"])/);
          let currentText = '';
          
          for (const word of words) {
            currentText += word;
            tokenCount++;
            
            const shouldContinue = onToken(currentText);
            if (shouldContinue === false) {
              return { 
                fullResponse: currentText, 
                tokenCount: totalTokens || tokenCount, 
                startTime 
              };
            }
            
            if (word.trim().length > 0) {
              if (/[.!?]/.test(word)) {
                await new Promise(resolve => setTimeout(resolve, 70));
              }
              else if (/[,;:]/.test(word)) {
                await new Promise(resolve => setTimeout(resolve, 40));
              }
              else {
                const baseDelay = 20;
                const randomFactor = Math.random() * 15;
                await new Promise(resolve => setTimeout(resolve, baseDelay + randomFactor));
              }
            }
          }
          
          fullResponse = completeText;
          return {
            fullResponse,
            tokenCount: totalTokens || tokenCount,
            startTime
          };
          
        } catch (error) {
        }
      }
      
      const response = await fetch(url.replace('streamGenerateContent', 'generateContent'), {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 429 || errorText.includes("quota") || errorText.includes("rate limit")) {
          throw new Error("QUOTA_EXCEEDED: Your Gemini API quota has been exceeded. Please try again later or upgrade your API plan.");
        }
        
        if (response.status === 400) {
          if (errorText.includes("invalid")) {
            throw new Error("INVALID_REQUEST: The request to Gemini API was invalid. Please check your input and try again.");
          }
          if (errorText.includes("content filtered")) {
            throw new Error("CONTENT_FILTERED: Your request was filtered due to safety settings or content policy violations.");
          }
        }
        
        if (response.status === 401) {
          throw new Error("AUTHENTICATION_ERROR: Invalid API key or authentication error. Please check your API key in Settings.");
        }
        
        if (response.status === 403) {
          throw new Error("PERMISSION_DENIED: You don't have permission to access this Gemini model or feature.");
        }
        
        if (response.status === 404) {
          throw new Error("NOT_FOUND: The requested Gemini model or resource was not found.");
        }
        
        if (response.status === 500 || response.status === 503) {
          throw new Error("SERVER_ERROR: Gemini API is experiencing issues. Please try again later.");
        }
        
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const jsonResponse = await response.json();
      
      const simulateWordByWordStreaming = async (text: string): Promise<boolean> => {
        if (!shouldStream || typeof onToken !== 'function') return true;
        
        const words = text.split(/(\s+|[,.!?;:"])/);
        let currentText = '';
        
        for (const word of words) {
          currentText += word;
          tokenCount++;
          
          const shouldContinue = onToken(currentText);
          if (shouldContinue === false) {
            return false;
          }
          
          if (word.trim().length > 0) {
            if (/[.!?]/.test(word)) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            else if (/[,;:]/.test(word)) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            else {
              const baseDelay = 25;
              const randomFactor = Math.random() * 20;
              await new Promise(resolve => setTimeout(resolve, baseDelay + randomFactor));
            }
          }
        }
        
        return true;
      };
      
      if (Array.isArray(jsonResponse)) {
        
        let completeText = '';
        let totalTokens = 0;
        
        for (let i = 0; i < jsonResponse.length; i++) {
          const chunk = jsonResponse[i];
          if (chunk.candidates && chunk.candidates.length > 0 && 
              chunk.candidates[0].content && 
              chunk.candidates[0].content.parts) {
            
            const parts = chunk.candidates[0].content.parts;
            for (const part of parts) {
              if (part.text) {
                completeText += part.text;
              }
            }
            
            if (chunk.usageMetadata && chunk.usageMetadata.totalTokenCount) {
              totalTokens += chunk.usageMetadata.totalTokenCount;
            }
          }
        }
        
        
        fullResponse = completeText;
        
        if (shouldStream && typeof onToken === 'function') {
          const shouldContinue = await simulateWordByWordStreaming(completeText);
          if (!shouldContinue) {
            return { 
              fullResponse, 
              tokenCount: totalTokens || tokenCount || completeText.split(/\s+/).length, 
              startTime 
            };
          }
        }
        
        return {
          fullResponse: completeText,
          tokenCount: totalTokens || tokenCount || completeText.split(/\s+/).length,
          startTime
        };
      } else if (jsonResponse.candidates) {
        
        let text = '';
        let toolCalls: ToolCall[] = [];
        let rawParts: any[] = [];
        if (jsonResponse.candidates.length > 0) {
          const candidate = jsonResponse.candidates[0];
          const parsed = this.parseGeminiCandidate(candidate);
          text = parsed.text;
          toolCalls = parsed.toolCalls;
          rawParts = parsed.rawParts;
          
          if (candidate.finishReason === 'MAX_TOKENS' && !text && toolCalls.length === 0) {
            throw new Error('Response was cut off due to token limit. Please try with a higher token limit.');
          }
          
          fullResponse = text;
          
          if (shouldStream && typeof onToken === 'function' && text) {
            const shouldContinue = await simulateWordByWordStreaming(text);
            if (!shouldContinue) {
              return { 
                fullResponse, 
                tokenCount: jsonResponse.usageMetadata?.totalTokenCount || tokenCount || text.split(/\s+/).length, 
                startTime,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                rawParts: rawParts.length > 0 ? rawParts : undefined,
              };
            }
          }
          
          return {
            fullResponse: text,
            tokenCount: jsonResponse.usageMetadata?.totalTokenCount || tokenCount || text.split(/\s+/).length,
            startTime,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            rawParts: rawParts.length > 0 ? rawParts : undefined,
          };
        }
      }
      
      throw new Error('Failed to extract content from Gemini API response');
    } catch (error) {
      throw error;
    }
  }
} 
