export enum ModelType {
  PROJECTION = 'projection',
  VISION = 'vision',
  LLM = 'llm',
}

export interface ModelFile {
  rfilename: string;
  size?: number;
  url?: string;
}

export interface ModelCapabilities {
  vision?: boolean;
  text?: boolean;
  code?: boolean;
}

export interface EnhancedStoredModel {
  name: string;
  path: string;
  size: number;
  modified: string;
  isExternal?: boolean;
  modelType?: ModelType;
  capabilities?: string[];
  supportsMultimodal?: boolean;
  compatibleProjectionModels?: string[];
  defaultProjectionModel?: string;
}

export interface VisionModelSizeBreakdown {
  llmSize: number;
  projectionSize: number;
  totalSize: number;
  hasProjection: boolean;
}