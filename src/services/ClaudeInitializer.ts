import { ClaudeService } from './ClaudeService';
import { onlineModelService } from './OnlineModelService';

let isInitialized = false;
let claudeService: ClaudeService;

export const initClaudeService = (): ClaudeService => {
  if (isInitialized) {
    return claudeService;
  }

  const instance = new ClaudeService(
    (provider: string) => onlineModelService.getApiKey(provider)
  );
  
  onlineModelService.setClaudeServiceGetter(() => instance);
  
  isInitialized = true;
  console.log('ClaudeService initialized successfully');
  
  claudeService = instance;
  
  return instance;
}; 