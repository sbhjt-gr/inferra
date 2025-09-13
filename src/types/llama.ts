export interface ModelMemoryInfo {
  requiredMemory: number;
  availableMemory: number;
}

export interface TokenQueueItem {
  token: string;
  timestamp: number;
}

export interface LlamaManagerInterface {
  getMemoryInfo(): Promise<ModelMemoryInfo>;
}

export interface LlamaManagerEvents {
  'model-loaded': (modelPath: string | null) => void;
  'model-unloaded': () => void;
}

export interface MultimodalContent {
  type: 'text' | 'image_url' | 'input_audio';
  text?: string;
  image_url?: {
    url?: string;
  };
  input_audio?: {
    format: 'wav' | 'mp3' | 'm4a';
    url?: string;
  };
}

export interface MultimodalMessage {
  role: string;
  content: string | MultimodalContent[];
}

export interface ProcessedMessage {
  text: string;
  images?: string[];
  audioFiles?: string[];
}

export interface MultimodalSupport {
  vision: boolean;
  audio: boolean;
}
