import { OpenAIService } from './OpenAIService';
import { onlineModelService } from './OnlineModelService';

let isInitialized = false;
let openAIService: OpenAIService;

export const initOpenAIService = (): OpenAIService => {
  if (isInitialized) {
    return openAIService;
  }

  const instance = new OpenAIService(
    (provider: string) => onlineModelService.getApiKey(provider)
  );
  
  onlineModelService.setOpenAIServiceGetter(() => instance);
  
  isInitialized = true;
  
  openAIService = instance;
  
  return instance;
}; 
