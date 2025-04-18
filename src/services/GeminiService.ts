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

export interface GeminiRequestOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  model?: string;
  streamTokens?: boolean;
}

export class GeminiService {
  private apiKeyProvider: (provider: string) => Promise<string | null>;

  constructor(apiKeyProvider: (provider: string) => Promise<string | null>) {
    this.apiKeyProvider = apiKeyProvider;
  }

  async generateResponse(
    messages: ChatMessage[],
    options: GeminiRequestOptions = {},
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
      const apiKey = await this.apiKeyProvider('gemini');
      if (!apiKey) {
        throw new Error('Gemini API key not found. Please set it in Settings.');
      }

      const temperature = options.temperature ?? 0.7;
      const maxTokens = options.maxTokens ?? 1024;
      const topP = options.topP ?? 0.9;
      const model = options.model ?? 'gemini-2.0-flash';
      console.log(`Using Gemini model: ${model}`);
      
      const shouldStream = !!onToken;
      const shouldStreamTokens = options.streamTokens ?? true;

      const userMessages = messages.filter(msg => msg.role !== 'system');
      const systemMessage = messages.find(msg => msg.role === 'system');
      
      let prompt = '';
      if (systemMessage) {
        prompt = `${systemMessage.content}\n\n`;
      }

      const formattedMessages = userMessages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const modelPath = model.startsWith('models/') ? model : `models/${model}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:${shouldStreamTokens ? 'streamGenerateContent' : 'generateContent'}?key=${apiKey}`;

      const requestBody = {
        contents: formattedMessages,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP,
        }
      };

      const headers = {
        'Content-Type': 'application/json'
      };

      if (shouldStreamTokens && shouldStream && typeof onToken === 'function') {
        console.log("Using simulated streaming for Gemini API");
        
        try {
          const response = await fetch(url.replace('streamGenerateContent', 'generateContent'), {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Gemini API error (${response.status}): ${errorText}`);
            console.error(`Request URL: ${url.replace(apiKey, 'API_KEY_REDACTED')}`);
            console.error(`Request body: ${JSON.stringify(requestBody)}`);
            throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
          }

          const jsonResponse = await response.json();
          console.log("Gemini complete response received, simulating streaming");
          
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
            console.error("Unexpected response format:", JSON.stringify(jsonResponse).substring(0, 200) + "...");
            throw new Error('Failed to extract content from Gemini API response');
          }
          
          console.log(`Complete response length: ${completeText.length} characters, now simulating streaming`);
          
          const words = completeText.split(/(\s+|[,.!?;:"])/);
          let currentText = '';
          
          for (const word of words) {
            currentText += word;
            tokenCount++;
            
            const shouldContinue = onToken(currentText);
            if (shouldContinue === false) {
              console.log('Simulated streaming canceled by callback');
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
          console.error('Error in streaming mode:', error);
        }
      }
      
      const response = await fetch(url.replace('streamGenerateContent', 'generateContent'), {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Gemini API error (${response.status}): ${errorText}`);
        console.error(`Request URL: ${url.replace(apiKey, 'API_KEY_REDACTED')}`);
        console.error(`Request body: ${JSON.stringify(requestBody)}`);
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const jsonResponse = await response.json();
      console.log("Gemini response received");
      
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
        console.log(`Received ${jsonResponse.length} response chunks`);
        
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
        
        console.log(`Complete response length: ${completeText.length} characters`);
        
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
        console.log("Single response object format detected");
        
        let text = '';
        if (jsonResponse.candidates.length > 0 && 
            jsonResponse.candidates[0].content && 
            jsonResponse.candidates[0].content.parts) {
          
          const parts = jsonResponse.candidates[0].content.parts;
          for (const part of parts) {
            if (part.text) {
              text += part.text;
            }
          }
          
          console.log(`Response length: ${text.length} characters`);
          
          fullResponse = text;
          
          if (shouldStream && typeof onToken === 'function') {
            const shouldContinue = await simulateWordByWordStreaming(text);
            if (!shouldContinue) {
              return { 
                fullResponse, 
                tokenCount: jsonResponse.usageMetadata?.totalTokenCount || tokenCount || text.split(/\s+/).length, 
                startTime 
              };
            }
          }
          
          return {
            fullResponse: text,
            tokenCount: jsonResponse.usageMetadata?.totalTokenCount || tokenCount || text.split(/\s+/).length,
            startTime
          };
        }
      }
      
      console.error("Unexpected response format:", JSON.stringify(jsonResponse).substring(0, 200) + "...");
      throw new Error('Failed to extract content from Gemini API response');
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      throw error;
    }
  }
} 