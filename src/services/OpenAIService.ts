import { fs as FileSystem } from './fs';
import type { Tool, ToolCall } from './tools/ToolRegistry';
import { openAIImageAdapter, type ImageGenOptions, type GeneratedImage } from './adapters/OpenAIImageAdapter';
import { openAIFileAdapter } from './adapters/OpenAIFileAdapter';

type ChatMessage = {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  thinking?: string;
  toolCallId?: string;
  stats?: {
    duration: number;
    tokens: number;
  };
};

export interface OpenAIRequestOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  model?: string;
  tools?: Tool[];
}

export type OpenAIResponse = {
  fullResponse: string;
  tokenCount: number;
  startTime: number;
  toolCalls?: ToolCall[];
  imageResult?: GeneratedImage;
};

export class OpenAIService {
  private apiKeyProvider: (provider: string) => Promise<string | null>;
  private baseUrlProvider: (provider: string) => Promise<string>;
  private currentProvider = 'chatgpt';

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
        case 'gif':
          mimeType = 'image/gif';
          break;
        default:
          mimeType = 'image/jpeg';
      }
      
      return { data: base64String, mimeType };
    } catch (error) {
      throw new Error('Failed to process image for OpenAI API');
    }
  }

  private async parseMessageContent(message: ChatMessage): Promise<any> {
    try {
      const parsed = JSON.parse(message.content);
      
      if (parsed.type === 'multimodal' && parsed.content) {
        const content: any[] = [];
        
        for (const item of parsed.content) {
          if (item.type === 'text') {
            content.push({
              type: 'text',
              text: item.text
            });
          } else if (item.type === 'image' && item.uri) {
            const { data, mimeType } = await this.convertImageToBase64(item.uri);
            content.push({
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${data}`
              }
            });
          }
        }
        
        return {
          role: message.role,
          content: content
        };
      }
      
      if (parsed.type === 'file_upload' && parsed.metadata?.openaiFileId) {
        const userContent = parsed.userContent || `File uploaded: ${parsed.fileName || 'file'}`;
        return {
          role: message.role,
          content: [
            { type: 'file', file: { file_id: parsed.metadata.openaiFileId } },
            { type: 'text', text: userContent },
          ],
        };
      }

      if (parsed.type === 'file_upload' && parsed.metadata?.remoteFileUri) {
        const fileName = parsed.fileName || 'document';
        const mimeType = parsed.metadata.mimeType || 'application/octet-stream';
        const userContent = parsed.userContent || `File uploaded: ${fileName}`;
        const ext = fileName.toLowerCase().split('.').pop() || '';
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        const uploadExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
          'csv', 'txt', 'md', 'html', 'json', 'jsonl'];

        if (imageExts.includes(ext)) {
          try {
            const base64 = await FileSystem.readAsStringAsync(
              parsed.metadata.remoteFileUri,
              { encoding: FileSystem.EncodingType.Base64 }
            );
            return {
              role: message.role,
              content: [
                {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${base64}` },
                },
                { type: 'text', text: userContent },
              ],
            };
          } catch (err) {
            console.log('openai_file_image_error', err instanceof Error ? err.message : 'unknown');
          }
        }

        if (uploadExts.includes(ext)) {
          try {
            const result = await openAIFileAdapter.upload(
              parsed.metadata.remoteFileUri, fileName, 'assistants', this.currentProvider || 'chatgpt'
            );
            console.log('openai_file_uploaded', fileName, result.id);
            return {
              role: message.role,
              content: [
                { type: 'file', file: { file_id: result.id } },
                { type: 'text', text: userContent },
              ],
            };
          } catch (err) {
            console.log('openai_file_upload_error', err instanceof Error ? err.message : 'unknown');
          }
        }

        try {
          const text = await FileSystem.readAsStringAsync(parsed.metadata.remoteFileUri);
          return {
            role: message.role,
            content: `--- ${fileName} ---\n${text}\n---\n\n${userContent}`,
          };
        } catch {
          return {
            role: message.role,
            content: userContent,
          };
        }
      }

      if (parsed.type === 'ocr_result') {
        const instruction = parsed.internalInstruction || '';
        const userPrompt = parsed.userPrompt || '';
        
        return {
          role: message.role,
          content: `${instruction}\n\nUser request: ${userPrompt}`
        };
      }
    } catch (error) {
    }

    if (message.role === 'tool' && message.toolCallId) {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
      };
    }

    try {
      const parsed = JSON.parse(message.content);
      if (parsed.type === 'openai_tool_use_response' && parsed.tool_calls) {
        return {
          role: 'assistant',
          content: parsed.content,
          tool_calls: parsed.tool_calls,
        };
      }
    } catch {
    }
    
    return {
      role: message.role,
      content: message.content
    };
  }

  private needsResponsesApi(messages: any[]): boolean {
    return messages.some(msg => {
      if (Array.isArray(msg.content)) {
        return msg.content.some((block: any) =>
          block.type === 'file' && block.file?.file_id
        );
      }
      return false;
    });
  }

  private toResponsesFormat(messages: any[]): any[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }
      if (Array.isArray(msg.content)) {
        const content = msg.content.map((block: any) => {
          if (block.type === 'text') {
            return { type: 'input_text', text: block.text };
          }
          if (block.type === 'file' && block.file?.file_id) {
            return { type: 'input_file', file_id: block.file.file_id };
          }
          if (block.type === 'file' && block.file?.file_data) {
            return {
              type: 'input_file',
              filename: block.file.filename,
              file_data: block.file.file_data,
            };
          }
          if (block.type === 'image_url') {
            return { type: 'input_image', image_url: block.image_url.url };
          }
          return block;
        });
        return { role: msg.role, content };
      }
      return msg;
    });
  }

  async generateResponse(
    messages: ChatMessage[],
    options: OpenAIRequestOptions = {},
    onToken?: (token: string) => boolean | void,
    provider = 'chatgpt'
  ): Promise<OpenAIResponse> {
    const startTime = Date.now();
    let tokenCount = 0;
    let fullResponse = '';

    try {
      this.currentProvider = provider;
      const apiKey = await this.apiKeyProvider(provider);
      if (!apiKey) {
        throw new Error('OpenAI API key not found. Please set it in Settings.');
      }

      const temperature = options.temperature ?? 0.7;
      const maxTokens = options.maxTokens ?? 1024;
      const topP = options.topP ?? 0.9;
      const model = options.model ?? 'gpt-4.1';

      const formattedMessages = [];
      for (const msg of messages) {
        const formattedMessage = await this.parseMessageContent(msg);
        formattedMessages.push(formattedMessage);
      }

  const baseUrl = await this.baseUrlProvider(provider);
  const useResponses = this.needsResponsesApi(formattedMessages);
  const url = useResponses
    ? `${baseUrl}/responses`
    : `${baseUrl}/chat/completions`;
  console.log('openai_api_endpoint', useResponses ? 'responses' : 'chat_completions');

      let requestBody: Record<string, any>;
      if (useResponses) {
        requestBody = {
          model,
          input: this.toResponsesFormat(formattedMessages),
          temperature,
          max_output_tokens: maxTokens,
          top_p: topP,
        };
      } else {
        requestBody = {
          model,
          messages: formattedMessages,
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
          stream: false,
        };
        if (options.tools && options.tools.length > 0) {
          requestBody.tools = options.tools;
        }
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log('openai_api_error', response.status, errorText.substring(0, 500));
        
        if (response.status === 429 || errorText.includes("quota") || errorText.includes("rate limit") || errorText.includes("insufficient_quota")) {
          throw new Error("QUOTA_EXCEEDED: Your OpenAI API quota has been exceeded. Please try again later or upgrade your API plan.");
        }
        
        if (response.status === 400) {
          if (errorText.includes("invalid")) {
            throw new Error("INVALID_REQUEST: The request to OpenAI API was invalid. Please check your input and try again.");
          }
          if (errorText.includes("content_policy")) {
            throw new Error("CONTENT_FILTERED: Your request was filtered due to content policy violations.");
          }
          if (errorText.includes("context_length_exceeded")) {
            throw new Error("CONTEXT_LENGTH_EXCEEDED: Your message is too long for the model's context window. Please shorten your input.");
          }
        }
        
        if (response.status === 401) {
          throw new Error("AUTHENTICATION_ERROR: Invalid API key or authentication error. Please check your API key in Settings.");
        }
        
        if (response.status === 403) {
          throw new Error("PERMISSION_DENIED: You don't have permission to access this model or feature.");
        }
        
        if (response.status === 404) {
          throw new Error("NOT_FOUND: The requested model or resource was not found. It may be deprecated or unavailable.");
        }
        
        if (response.status === 500 || response.status === 503) {
          throw new Error("SERVER_ERROR: OpenAI API is experiencing issues. Please try again later.");
        }
        
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const jsonResponse = await response.json();
      
      if (jsonResponse.output && jsonResponse.output.length > 0) {
        const message = jsonResponse.output[0];
        
        if (message.content && message.content.length > 0) {
          const contentItem = message.content[0];
          
          if (contentItem.type === 'output_text' && contentItem.text) {
            const text = contentItem.text;
            fullResponse = text;
            
            if (onToken) {
              const simulateWordByWordStreaming = async (text: string): Promise<boolean> => {
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
              
              const shouldContinue = await simulateWordByWordStreaming(text);
              if (!shouldContinue) {
                return { 
                  fullResponse, 
                  tokenCount: jsonResponse.usage?.output_tokens || tokenCount, 
                  startTime 
                };
              }
            }
            
            return {
              fullResponse: text,
              tokenCount: jsonResponse.usage?.output_tokens || text.split(/\s+/).length,
              startTime
            };
          }
        }
      } else if (jsonResponse.choices && jsonResponse.choices.length > 0) {
        const choice = jsonResponse.choices[0];

        if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
          const toolCalls: ToolCall[] = choice.message.tool_calls.map((tc: any) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }));
          return {
            fullResponse: choice.message.content || '',
            tokenCount: jsonResponse.usage?.completion_tokens || 0,
            startTime,
            toolCalls,
          };
        }
        
        if (choice.message && choice.message.content) {
          const text = choice.message.content;
          fullResponse = text;
          
          if (onToken) {
            const simulateWordByWordStreaming = async (text: string): Promise<boolean> => {
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
            
            const shouldContinue = await simulateWordByWordStreaming(text);
            if (!shouldContinue) {
              return { 
                fullResponse, 
                tokenCount: jsonResponse.usage?.completion_tokens || tokenCount, 
                startTime 
              };
            }
          }
          
          return {
            fullResponse: text,
            tokenCount: jsonResponse.usage?.completion_tokens || text.split(/\s+/).length,
            startTime
          };
        }
      }
      
      throw new Error('Failed to extract content from OpenAI API response');
    } catch (error) {
      throw error;
    }
  }

  async generateImage(
    prompt: string,
    options: ImageGenOptions = {},
    provider = 'chatgpt'
  ): Promise<GeneratedImage> {
    return openAIImageAdapter.generate(prompt, options, provider);
  }
} 
