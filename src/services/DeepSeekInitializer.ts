import { DeepSeekService } from './DeepSeekService';
import { onlineModelService } from './OnlineModelService';

let isInitialized = false;
let deepSeekService: DeepSeekService;

export const initDeepSeekService = (): DeepSeekService => {
  if (isInitialized) {
    return deepSeekService;
  }

  const instance = new DeepSeekService(
    (provider: string) => onlineModelService.getApiKey(provider)
  );
  
  onlineModelService.setDeepSeekServiceGetter(() => instance);
  
  isInitialized = true;
  console.log('DeepSeekService initialized successfully');
  
  deepSeekService = instance;
  
  return instance;
}; 