type ChatMessage = {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  thinking?: string;
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
}

export class OpenAIService {
  private apiKeyProvider: (provider: string) => Promise<string | null>;

  constructor(apiKeyProvider: (provider: string) => Promise<string | null>) {
    this.apiKeyProvider = apiKeyProvider;
  }

  async generateResponse(
    messages: ChatMessage[],
    options: OpenAIRequestOptions = {},
    onToken?: (token: string) => boolean | void
  ): Promise<{
    fullResponse: string;
    tokenCount: number;
    startTime: number;
  }> {
    const startTime = Date.now();
    let tokenCount = 0;
    let fullResponse = '';

    try {
      const apiKey = await this.apiKeyProvider('chatgpt');
      if (!apiKey) {
        throw new Error('OpenAI API key not found. Please set it in Settings.');
      }

      const temperature = options.temperature ?? 0.7;
      const maxTokens = options.maxTokens ?? 1024;
      const topP = options.topP ?? 0.9;
      const model = options.model ?? 'gpt-4o';
      console.log(`Using OpenAI model: ${model}`);

      const formattedMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const url = `https://api.openai.com/v1/chat/completions`;
      
      const requestBody = {
        model,
        messages: formattedMessages,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        stream: false
      };

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
      
      console.log('Making request to OpenAI API...');
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenAI API error (${response.status}): ${errorText}`);
        console.error(`Request URL: ${url}`);
        console.error(`Request body: ${JSON.stringify(requestBody)}`);
        
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
      console.log("OpenAI response received");
      
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
      
      console.error("Unexpected response format:", JSON.stringify(jsonResponse).substring(0, 200) + "...");
      throw new Error('Failed to extract content from OpenAI API response');
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      throw error;
    }
  }
} 