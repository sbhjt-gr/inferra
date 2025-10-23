import * as FileSystem from 'expo-file-system';
import { ModelInfo } from '../../ModelDownloaderTypes';

export async function getFileSize(path: string | null): Promise<number> {
  if (!path) {
    return 0;
  }

  try {
    const info = await FileSystem.getInfoAsync(path, { size: true });
    if (info?.exists) {
      const size = (info as any).size;
      return typeof size === 'number' ? size : 0;
    }
  } catch (error) {
  }

  return 0;
}

export async function findStoredModel(
  models: ModelInfo[],
  targetPath: string | null,
  targetName: string | null
): Promise<{ model: ModelInfo; projectorPath: string | null } | null> {
  let target: ModelInfo | null = null;

  if (targetPath) {
    target = models.find(model => model.path === targetPath) || null;
  }

  if (!target && targetName) {
    target = models.find(model => model.name === targetName) || null;
  }

  if (!target) {
    return null;
  }

  let projectorPath: string | null = null;
  if (target.path) {
    const dir = target.path.substring(0, target.path.lastIndexOf('/'));
    const baseName = target.path.substring(target.path.lastIndexOf('/') + 1);
    const potentialProjectorName = baseName.replace('.gguf', '-mmproj-f16.gguf');
    const potentialProjectorPath = `${dir}/${potentialProjectorName}`;

    try {
      const info = await FileSystem.getInfoAsync(potentialProjectorPath);
      if (info?.exists) {
        projectorPath = potentialProjectorPath;
      }
    } catch (error) {
    }
  }

  return { model: target, projectorPath };
}
