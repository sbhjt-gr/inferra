import {
  isVisionRepo,
  getMmprojFiles,
  getLLMFiles,
  isProjectionModel,
  detectVisionCapabilities,
  getRecommendedProjectionModel,
} from '../multimodalHelpers';
import { ModelFile } from '../../types/models';

describe('multimodalHelpers', () => {
  const testModelFiles: ModelFile[] = [
    { rfilename: 'SmolVLM2-500M-Video-Instruct-f16.gguf', size: 1000000 },
    { rfilename: 'mmproj-SmolVLM2-500M-Video-Instruct-f16.gguf', size: 500000 },
    { rfilename: 'mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf', size: 400000 },
  ];

  const nonVisionFiles: ModelFile[] = [
    { rfilename: 'gemma-3-1b-it-Q8_0.gguf', size: 1000000 },
    { rfilename: 'phi-3-mini-4k-instruct-Q4_K_M.gguf', size: 2000000 },
  ];

  describe('isVisionRepo', () => {
    test('detects vision repos with mmproj files', () => {
      expect(isVisionRepo(testModelFiles)).toBe(true);
    });

    test('returns false for non-vision repos', () => {
      expect(isVisionRepo(nonVisionFiles)).toBe(false);
    });

    test('returns false for empty array', () => {
      expect(isVisionRepo([])).toBe(false);
    });
  });

  describe('getMmprojFiles', () => {
    test('filters out mmproj files correctly', () => {
      const projFiles = getMmprojFiles(testModelFiles);
      expect(projFiles).toHaveLength(2);
      expect(projFiles[0].rfilename).toBe('mmproj-SmolVLM2-500M-Video-Instruct-f16.gguf');
      expect(projFiles[1].rfilename).toBe('mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf');
    });

    test('returns empty array for non-vision files', () => {
      expect(getMmprojFiles(nonVisionFiles)).toHaveLength(0);
    });
  });

  describe('getLLMFiles', () => {
    test('filters out non-mmproj files correctly', () => {
      const llmFiles = getLLMFiles(testModelFiles);
      expect(llmFiles).toHaveLength(1);
      expect(llmFiles[0].rfilename).toBe('SmolVLM2-500M-Video-Instruct-f16.gguf');
    });
  });

  describe('isProjectionModel', () => {
    test('detects projection models correctly', () => {
      expect(isProjectionModel('mmproj-SmolVLM2-500M-Video-Instruct-f16.gguf')).toBe(true);
      expect(isProjectionModel('mmproj-model-Q8_0.gguf')).toBe(true);
      expect(isProjectionModel('model_mmproj_f16.gguf')).toBe(true);
    });

    test('returns false for non-projection models', () => {
      expect(isProjectionModel('SmolVLM2-500M-Video-Instruct-f16.gguf')).toBe(false);
      expect(isProjectionModel('gemma-3-1b-it-Q8_0.gguf')).toBe(false);
    });
  });

  describe('detectVisionCapabilities', () => {
    test('detects vision model correctly', () => {
      const result = detectVisionCapabilities('SmolVLM2-500M-Video-Instruct-f16.gguf', testModelFiles);
      expect(result.isVision).toBe(true);
      expect(result.isProjection).toBe(false);
      expect(result.capabilities).toContain('vision');
      expect(result.capabilities).toContain('text');
      expect(result.compatibleProjections).toHaveLength(2);
      expect(result.defaultProjection).toBe('mmproj-SmolVLM2-500M-Video-Instruct-f16.gguf');
    });

    test('detects projection model correctly', () => {
      const result = detectVisionCapabilities('mmproj-SmolVLM2-500M-Video-Instruct-f16.gguf', testModelFiles);
      expect(result.isVision).toBe(false);
      expect(result.isProjection).toBe(true);
      expect(result.capabilities).toEqual(['text']);
      expect(result.compatibleProjections).toHaveLength(0);
    });

    test('detects regular LLM model correctly', () => {
      const result = detectVisionCapabilities('gemma-3-1b-it-Q8_0.gguf', nonVisionFiles);
      expect(result.isVision).toBe(false);
      expect(result.isProjection).toBe(false);
      expect(result.capabilities).toEqual(['text']);
      expect(result.compatibleProjections).toHaveLength(0);
    });
  });

  describe('getRecommendedProjectionModel', () => {
    test('recommends exact quantization match', () => {
      const projModels = [
        'mmproj-SmolVLM2-500M-Video-Instruct-f16.gguf',
        'mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf',
      ];
      const result = getRecommendedProjectionModel('SmolVLM2-500M-Video-Instruct-f16.gguf', projModels);
      expect(result).toBe('mmproj-SmolVLM2-500M-Video-Instruct-f16.gguf');
    });

    test('returns single model when only one available', () => {
      const result = getRecommendedProjectionModel(
        'SmolVLM2-500M-Video-Instruct-f16.gguf',
        ['mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf']
      );
      expect(result).toBe('mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf');
    });

    test('returns undefined for empty projection models', () => {
      const result = getRecommendedProjectionModel('SmolVLM2-500M-Video-Instruct-f16.gguf', []);
      expect(result).toBeUndefined();
    });
  });
});