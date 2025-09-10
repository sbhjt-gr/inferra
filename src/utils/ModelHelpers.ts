import { StoredModel } from '../services/ModelDownloaderTypes';
import { DownloadableModel } from '../components/model/DownloadableModelItem';
import { ModelType } from '../types/models';
import { filterProjectionModels } from './multimodalHelpers';

export function getVisionModels(models: StoredModel[]): StoredModel[] {
  return models.filter(model => model.modelType === ModelType.VISION);
}

export function getProjectionModels(models: StoredModel[]): StoredModel[] {
  return models.filter(model => model.modelType === ModelType.PROJECTION);
}

export function getDisplayModels(models: StoredModel[]): StoredModel[] {
  return filterProjectionModels(models);
}

export function isVisionModel(model: StoredModel | DownloadableModel): boolean {
  return (model as any).modelType === ModelType.VISION || 
         (model as any).supportsMultimodal === true ||
         ((model as any).capabilities && (model as any).capabilities.includes('vision'));
}

export function getModelCapabilitiesText(model: StoredModel | DownloadableModel): string {
  const capabilities = (model as any).capabilities || [];
  if (capabilities.length === 0) return 'text';
  
  return capabilities.join(', ');
}

export function getVisionModelInfo(model: StoredModel): {
  hasProjection: boolean;
  projectionCount: number;
  defaultProjection?: string;
} {
  const compatibleProjections = model.compatibleProjectionModels || [];
  
  return {
    hasProjection: compatibleProjections.length > 0,
    projectionCount: compatibleProjections.length,
    defaultProjection: model.defaultProjectionModel,
  };
}
