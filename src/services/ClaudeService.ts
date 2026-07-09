import { fs as FileSystem } from './fs';
import { claudeFileAdapter, isClaudeUploadable, isClaudeImageFile } from './adapters/ClaudeFileAdapter';
import type { Tool, ToolSchema, ToolCall } from './tools/ToolRegistry';

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

export interface ClaudeRequestOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  model?: string;
  tools?: Tool[];
}

export type ClaudeResponse = {
  fullResponse: string;
  tokenCount: number;
  startTime: number;
  toolCalls?: ToolCall[];
  rawContent?: any[];
};

export class ClaudeService {
  private apiKeyProvider: (provider: string) => Promise<string | null>;
  private baseUrlProvider: (provider: string) => Promise<string>;
  private currentProvider = 'claude';

  constructor(
    apiKeyProvider: (provider: string) => Promise<string | null>,
    baseUrlProvider: (provider: string) => Promise<string>
  ) {
    this.apiKeyProvider = apiKeyProvider;
    this.baseUrlProvider = baseUrlProvider;
  }

  private log(tag: string, data?: Record<string, any>): void {
    if (data) {
      console.log(tag, data);
      return;
    }
    console.log(tag);
  }

  private async convertImageToBase64(imageUri: string): Promise<{ data: string; mimeType: string }> {
    try {
      this.log('claude_img_start', { uri: imageUri });
      const base64String = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const fileExtension = imageUri.toLowerCase().split('.').pop();
      let mimeType = 'image/jpeg'; // default
      
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

      this.log('claude_img_ok', { mimeType, size: base64String.length });
      
      return { data: base64String, mimeType };
    } catch (error) {
      this.log('claude_img_fail', {
        msg: error instanceof Error ? error.message : 'unknown',
      });
      throw new Error('Failed to process image for Claude API');
    }
  }

  private async parseMessageContent(message: ChatMessage): Promise<any> {
    this.log('claude_parse_msg', {
      role: message.role,
      hasToolCallId: !!message.toolCallId,
      contentLen: message.content?.length ?? 0,
    });

    try {
      const parsed = JSON.parse(message.content);
      this.log('claude_parse_json_ok', { type: parsed?.type || 'none' });

      if (parsed.type === 'tool_use_response' && parsed.rawContent) {
        this.log('claude_parse_tool_use_rsp', {
          blocks: Array.isArray(parsed.rawContent) ? parsed.rawContent.length : 0,
        });
        return {
          role: 'assistant',
          content: parsed.rawContent,
        };
      }
      
      if (parsed.type === 'multimodal' && parsed.content) {
        this.log('claude_parse_multimodal', {
          blocks: Array.isArray(parsed.content) ? parsed.content.length : 0,
        });
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
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: data
              }
            });
          }
        }
        
        return {
          role: message.role === 'user' ? 'user' : 'assistant',
          content: content
        };
      }
      
      if (parsed.type === 'ocr_result') {
        this.log('claude_parse_ocr');
        const instruction = parsed.internalInstruction || '';
        const userPrompt = parsed.userPrompt || '';
        
        return {
          role: message.role === 'user' ? 'user' : 'assistant',
          content: `${instruction}\n\nUser request: ${userPrompt}`
        };
      }

      if (parsed.type === 'file_upload' && parsed.metadata?.claudeFileId) {
        this.log('claude_parse_file_id', {
          fileName: parsed.fileName || 'document',
          fileId: parsed.metadata.claudeFileId,
        });
        const userContent = parsed.userContent || `Analyze this file: ${parsed.fileName || 'document'}`;
        const filename = parsed.fileName || 'document';
        const isImage = isClaudeImageFile(filename);
        return {
          role: message.role === 'user' ? 'user' : 'assistant',
          content: [
            isImage
              ? { type: 'image', source: { type: 'file', file_id: parsed.metadata.claudeFileId } }
              : { type: 'document', source: { type: 'file', file_id: parsed.metadata.claudeFileId } },
            { type: 'text', text: userContent },
          ],
        };
      }

      if (parsed.type === 'file_upload' && parsed.metadata?.remoteFileUri) {
        const fileName = parsed.fileName || 'document';
        const userContent = parsed.userContent || `Analyze this file: ${fileName}`;
        const ext = fileName.toLowerCase().split('.').pop() || '';
        this.log('claude_parse_file_uri', {
          fileName,
          ext,
          hasMime: !!parsed.metadata.mimeType,
        });

        if (isClaudeUploadable(fileName)) {
          try {
            this.log('claude_file_upload_try', { fileName, provider: this.currentProvider });
            const result = await claudeFileAdapter.upload(
              parsed.metadata.remoteFileUri, fileName, this.currentProvider
            );
            this.log('claude_file_upload_ok', { fileName, fileId: result.id });
            const isImage = isClaudeImageFile(fileName);
            return {
              role: message.role === 'user' ? 'user' : 'assistant',
              content: [
                isImage
                  ? { type: 'image', source: { type: 'file', file_id: result.id } }
                  : { type: 'document', source: { type: 'file', file_id: result.id } },
                { type: 'text', text: userContent },
              ],
            };
          } catch (err) {
            this.log('claude_file_upload_fail', {
              fileName,
              msg: err instanceof Error ? err.message : 'unknown',
            });
          }
        }

        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (imageExts.includes(ext)) {
          try {
            this.log('claude_img_fallback_try', { fileName });
            const base64 = await FileSystem.readAsStringAsync(
              parsed.metadata.remoteFileUri,
              { encoding: FileSystem.EncodingType.Base64 }
            );
            this.log('claude_img_fallback_ok', { fileName, size: base64.length });
            return {
              role: message.role === 'user' ? 'user' : 'assistant',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: parsed.metadata.mimeType || 'image/jpeg', data: base64 },
                },
                { type: 'text', text: userContent },
              ],
            };
          } catch (err) {
            this.log('claude_img_fallback_fail', {
              fileName,
              msg: err instanceof Error ? err.message : 'unknown',
            });
          }
        }

        try {
          this.log('claude_text_fallback_try', { fileName });
          const text = await FileSystem.readAsStringAsync(parsed.metadata.remoteFileUri);
          this.log('claude_text_fallback_ok', { fileName, size: text.length });
          return {
            role: message.role === 'user' ? 'user' : 'assistant',
            content: `--- ${fileName} ---\n${text}\n---\n\n${userContent}`,
          };
        } catch {
          this.log('claude_text_fallback_fail', { fileName });
          return {
            role: message.role === 'user' ? 'user' : 'assistant',
            content: userContent,
          };
        }
      }
    } catch (error) {
      this.log('claude_parse_json_fail', {
        msg: error instanceof Error ? error.message : 'unknown',
      });
    }

    if (message.toolCallId) {
      this.log('claude_parse_tool_result', { toolCallId: message.toolCallId });
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId,
            content: message.content,
          },
        ],
      };
    }
    
    return {
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.content
    };
  }

  private toClaudeTools(tools: Tool[]): any[] {
    const claudeTools: any[] = [];

    for (const t of tools) {
      if ('function' in t) {
        claudeTools.push({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        });
      } else if (t.type === 'web_search_preview') {
        // Legacy builtin mapping kept for compatibility; prefer function tool web_search.
        claudeTools.push({
          type: 'web_search_20250305',
          name: 'web_search',
        });
      }
    }

    return claudeTools;
  }

  async generateResponse(
    messages: ChatMessage[],
    options: ClaudeRequestOptions = {},
    onToken?: (token: string) => boolean | void,
    provider = 'claude'
  ): Promise<ClaudeResponse> {
    const startTime = Date.now();
    let tokenCount = 0;
    let fullResponse = '';

    try {
      this.currentProvider = provider;
      this.log('claude_gen_start', {
        provider,
        msgCount: messages.length,
        hasTools: !!(options.tools && options.tools.length > 0),
      });
      const apiKey = await this.apiKeyProvider(provider);
      if (!apiKey) {
        this.log('claude_key_missing', { provider });
        throw new Error('Claude API key not found. Please set it in Settings.');
      }

      const temperature = options.temperature ?? 0.7;
      const maxTokens = options.maxTokens ?? 1024;
      const topP = options.topP;
      const model = options.model ?? 'claude-3-7-sonnet-20250219';

      let systemMessage: string | undefined;
      const userAssistantMessages = messages.filter(msg => {
        if (msg.role === 'system') {
          systemMessage = msg.content;
          return false;
        }
        return true;
      });

      const formattedMessages = [];
      for (const msg of userAssistantMessages) {
        const formattedMessage = await this.parseMessageContent(msg);
        formattedMessages.push(formattedMessage);
      }
      this.log('claude_msgs_ready', {
        total: formattedMessages.length,
        roles: formattedMessages.map((m: any) => m.role).join(','),
      });

      const requestBody: Record<string, any> = {
        model,
        messages: formattedMessages,
        max_tokens: maxTokens,
        temperature,
      };

      if (options.temperature == null && typeof topP === 'number') {
        requestBody.top_p = topP;
        delete requestBody.temperature;
      }

      if (options.temperature != null && typeof topP === 'number') {
        this.log('claude_sampling_conflict', {
          model,
          note: 'temperature_prioritized',
          temperature,
          topP,
        });
      }

      if (systemMessage) {
        requestBody.system = systemMessage;
      }

      if (options.tools && options.tools.length > 0) {
        const claudeTools = this.toClaudeTools(options.tools);
        if (claudeTools.length > 0) {
          requestBody.tools = claudeTools;
          this.log('claude_tools_ready', { count: claudeTools.length });
        }
      }


      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      };

      const hasFileRef = formattedMessages.some((msg: any) =>
        Array.isArray(msg.content) &&
        msg.content.some((block: any) => block.source?.type === 'file' && block.source?.file_id)
      );
      if (hasFileRef) {
        headers['anthropic-beta'] = 'files-api-2025-04-14';
        this.log('claude_header_beta', { enabled: true });
      }

      
  const baseUrl = await this.baseUrlProvider(provider);
  this.log('claude_req_send', {
    baseUrl,
    model,
    maxTokens,
    temp: requestBody.temperature ?? null,
    topP: requestBody.top_p ?? null,
    tools: requestBody.tools ? requestBody.tools.length : 0,
    hasSystem: !!requestBody.system,
  });
  const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
      this.log('claude_rsp_status', { status: response.status, ok: response.ok });

      
      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const jsonResponse = await response.json();
      this.log('claude_rsp_json', {
        hasContent: !!jsonResponse.content,
        contentLen: Array.isArray(jsonResponse.content) ? jsonResponse.content.length : 0,
        stopReason: jsonResponse.stop_reason || 'none',
      });
      
      if (jsonResponse.content && jsonResponse.content.length > 0) {
        let text = '';
        const toolCalls: ToolCall[] = [];
        
        for (const block of jsonResponse.content) {
          if (block.type === 'text' && block.text) {
            text += block.text;
          }
          if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            });
          }
        }

        if (toolCalls.length > 0) {
          this.log('claude_tool_calls', { count: toolCalls.length, textLen: text.length });
          return {
            fullResponse: text,
            tokenCount: jsonResponse.usage?.output_tokens || 0,
            startTime,
            toolCalls,
            rawContent: jsonResponse.content,
          };
        }
        
        fullResponse = text;
        tokenCount = jsonResponse.usage?.output_tokens || text.split(/\s+/).length;
        this.log('claude_text_done', { textLen: text.length, tokenCount });
        
        if (onToken) {
          await this.simulateStreaming(text, onToken);
        }
        
        return {
          fullResponse: text,
          tokenCount,
          startTime
        };
      }
      
      this.log('claude_rsp_empty');
      throw new Error('Failed to extract content from Claude API response');
    } catch (error) {
      this.log('claude_gen_fail', {
        provider,
        msg: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const errorText = await response.text();
    this.log('claude_rsp_error', {
      status: response.status,
      text: errorText.slice(0, 1000),
    });
    
    if (response.status === 429 || errorText.includes("quota") || errorText.includes("rate_limit")) {
      throw new Error("QUOTA_EXCEEDED: Your Claude API quota has been exceeded. Please try again later or upgrade your API plan.");
    }
    
    if (response.status === 400) {
      if (errorText.includes("invalid")) {
        throw new Error("INVALID_REQUEST: The request to Claude API was invalid. Please check your input and try again.");
      }
      if (errorText.includes("content_policy") || errorText.includes("filtered") || errorText.includes("harmful")) {
        throw new Error("CONTENT_FILTERED: Your request was filtered due to content policy violations.");
      }
      if (errorText.includes("context_length_exceeded") || errorText.includes("too long")) {
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
      throw new Error("SERVER_ERROR: Claude API is experiencing issues. Please try again later.");
    }
    
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  private async simulateStreaming(text: string, onToken: (token: string) => boolean | void): Promise<boolean> {
    const words = text.split(/(\s+|[,.!?;:"])/);
    let currentText = '';
    
    for (const word of words) {
      currentText += word;
      
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
  }
} 
