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
  streamTokens?: boolean;
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
      
      const shouldStream = !!onToken;
      const shouldStreamTokens = options.streamTokens ?? true;

      const formattedMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const url = `https://api.openai.com/v1/${shouldStreamTokens ? 'chat/completions' : 'chat/completions'}`;

      const requestBody = {
        model,
        messages: formattedMessages,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        stream: shouldStreamTokens && shouldStream
      };

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };

      if (shouldStreamTokens && shouldStream && typeof onToken === 'function') {
        console.log("Using streaming for OpenAI API");
        
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`OpenAI API error (${response.status}): ${errorText}`);
            console.error(`Request URL: ${url}`);
            console.error(`Request body: ${JSON.stringify({...requestBody, model})}`);
            
            if (response.status === 429 || errorText.includes("quota") || errorText.includes("rate limit")) {
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

          if (!response.body) {
            throw new Error('Response body is null');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let completeResponse = '';

          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                if (data.trim() === '[DONE]') {
                  continue;
                }

                try {
                  const json = JSON.parse(data);
                  
                  if (json.choices && json.choices.length > 0) {
                    const delta = json.choices[0].delta;
                    
                    if (delta && delta.content) {
                      completeResponse += delta.content;
                      tokenCount++;
                      
                      const shouldContinue = onToken(completeResponse);
                      if (shouldContinue === false) {
                        reader.cancel();
                        console.log('Streaming canceled by callback');
                        return { 
                          fullResponse: completeResponse, 
                          tokenCount, 
                          startTime 
                        };
                      }
                    }
                  }
                } catch (e) {
                  console.error('Error parsing JSON from stream:', e);
                }
              }
            }
          }
          
          fullResponse = completeResponse;
          return {
            fullResponse,
            tokenCount,
            startTime
          };
          
        } catch (error) {
          console.error('Error in streaming mode:', error);
          throw error;
        }
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...requestBody,
          stream: false
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenAI API error (${response.status}): ${errorText}`);
        console.error(`Request URL: ${url}`);
        console.error(`Request body: ${JSON.stringify({...requestBody, stream: false})}`);
        
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
      
      if (jsonResponse.choices && jsonResponse.choices.length > 0) {
        const choice = jsonResponse.choices[0];
        
        if (choice.message && choice.message.content) {
          const text = choice.message.content;
          fullResponse = text;
          
          if (shouldStream && typeof onToken === 'function') {
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