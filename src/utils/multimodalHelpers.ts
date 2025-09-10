import { ModelFile, VisionModelSizeBreakdown } from '../types/models';

const MMProjRegex = /[-_.]*mmproj[-_.].+\.gguf$/i;

export function isVisionRepo(siblings: ModelFile[]): boolean {
  return siblings.some(f => MMProjRegex.test(f.rfilename));
}

export function getMmprojFiles(siblings: ModelFile[]): ModelFile[] {
  return siblings.filter(f => MMProjRegex.test(f.rfilename));
}

export function getLLMFiles(siblings: ModelFile[]): ModelFile[] {
  return siblings.filter(f => !MMProjRegex.test(f.rfilename));
}

export function isProjectionModel(filename: string): boolean {
  return MMProjRegex.test(filename);
}

export function extractModelPrecision(filename: string): string | null {
  const patterns = [
    /[._-](Q\d+_K[_A-Z]*)/i,
    /[._-](Q\d+_\d+)/i,
    /[._-](Q\d+)/i,
    /[._-](F\d+)/i,
    /[._-](f\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

export function getQuantRank(quant: string): number {
  const quantMap: { [key: string]: number } = {
    'f32': 100, 'f16': 90, 'f16_f32': 85,
    'q8_0': 80, 'q6_k': 70, 'q5_k_m': 65, 'q5_k_s': 60, 'q5_1': 58, 'q5_0': 55,
    'q4_k_m': 50, 'q4_k_s': 45, 'q4_1': 43, 'q4_0': 40,
    'q3_k_l': 35, 'q3_k_m': 30, 'q3_k_s': 25,
    'q2_k': 20, 'q2_k_s': 15,
  };
  
  return quantMap[quant.toLowerCase()] || -1;
}

export function getRecommendedProjectionModel(
  visionModelFilename: string,
  availableProjModels: string[],
): string | undefined {
  if (availableProjModels.length === 0) {
    return undefined;
  }
  if (availableProjModels.length === 1) {
    return availableProjModels[0];
  }

  const getHighestQualityModel = (): string => {
    return [...availableProjModels].sort((a, b) => {
      const rankA = getQuantRank(extractModelPrecision(a) || '');
      const rankB = getQuantRank(extractModelPrecision(b) || '');
      return rankB - rankA;
    })[0];
  };

  const llmQuant = extractModelPrecision(visionModelFilename);
  if (!llmQuant) {
    return getHighestQualityModel();
  }

  const llmRank = getQuantRank(llmQuant);
  if (llmRank === -1) {
    return getHighestQualityModel();
  }

  const exactMatch = availableProjModels.find(
    p => extractModelPrecision(p)?.toLowerCase() === llmQuant.toLowerCase(),
  );
  if (exactMatch) {
    return exactMatch;
  }

  const sortedByProximity = [...availableProjModels].sort((a, b) => {
    const rankA = getQuantRank(extractModelPrecision(a) || '');
    const rankB = getQuantRank(extractModelPrecision(b) || '');
    const diffA =
      rankA - llmRank >= 0 ? rankA - llmRank : Number.MAX_SAFE_INTEGER;
    const diffB =
      rankB - llmRank >= 0 ? rankB - llmRank : Number.MAX_SAFE_INTEGER;
    return diffA - diffB;
  });

  const closestMatch = sortedByProximity.find(
    p => getQuantRank(extractModelPrecision(p) || '') >= llmRank,
  );

  return closestMatch ?? getHighestQualityModel();
}

export function filterProjectionModels<T extends {modelType?: string}>(
  models: T[],
): T[] {
  return models.filter(model => model.modelType !== 'projection');
}

export function getVisionModelSizeBreakdown(
  modelFile: ModelFile,
  siblings: ModelFile[],
): VisionModelSizeBreakdown {
  const llmSize = modelFile.size || 0;
  let projectionSize = 0;
  let hasProjection = false;

  const mmprojFiles = getMmprojFiles(siblings);
  if (mmprojFiles.length > 0) {
    const recommendedProj = getRecommendedProjectionModel(
      modelFile.rfilename,
      mmprojFiles.map(f => f.rfilename),
    );

    if (recommendedProj) {
      const projFile = mmprojFiles.find(f => f.rfilename === recommendedProj);
      if (projFile && projFile.size) {
        projectionSize = projFile.size;
        hasProjection = true;
      }
    }
  }

  return {
    llmSize,
    projectionSize,
    totalSize: llmSize + projectionSize,
    hasProjection,
  };
}

export function detectVisionCapabilities(filename: string, siblings?: ModelFile[]): {
  isVision: boolean;
  isProjection: boolean;
  capabilities: string[];
  compatibleProjections: string[];
  defaultProjection?: string;
} {
  const isProjection = isProjectionModel(filename);
  const isVision = siblings ? isVisionRepo(siblings) && !isProjection : false;
  
  let capabilities: string[] = ['text'];
  let compatibleProjections: string[] = [];
  let defaultProjection: string | undefined;

  if (isVision && siblings) {
    capabilities.push('vision');
    const mmprojFiles = getMmprojFiles(siblings);
    compatibleProjections = mmprojFiles.map(f => f.rfilename);
    defaultProjection = getRecommendedProjectionModel(filename, compatibleProjections);
  }

  return {
    isVision,
    isProjection,
    capabilities,
    compatibleProjections,
    defaultProjection,
  };
}
