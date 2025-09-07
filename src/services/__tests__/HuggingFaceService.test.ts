import { huggingFaceService } from '../HuggingFaceService';

jest.mock('@env', () => ({
  HUGGINGFACE_TOKEN: 'test-token',
}));

describe('HuggingFaceService Vision Detection', () => {
  describe('processSearchResults', () => {
    it('should detect VLM models by siblings', () => {
      const testModels = [
        { 
          id: 'microsoft/SmolVLM-500M',
          tags: [],
          downloads: 100,
          likes: 10,
          siblings: [
            { rfilename: 'SmolVLM-500M-Instruct-f16.gguf' },
            { rfilename: 'mmproj-SmolVLM-500M-Instruct-f16.gguf' },
          ]
        },
        { 
          id: 'huggingface/CodeLlama-7B',
          tags: [],
          downloads: 300,
          likes: 30,
          siblings: [
            { rfilename: 'codellama-7b.Q4_K_M.gguf' },
          ]
        },
      ];

      const result = (huggingFaceService as any).processSearchResults(testModels);

      expect(result[0].hasVision).toBe(true);
      expect(result[0].capabilities).toEqual(['vision', 'text']);
      
      expect(result[1].hasVision).toBe(false);
      expect(result[1].capabilities).toEqual(['text']);
    });

    it('should filter GGUF files and add download URLs', () => {
      const testModels = [
        { 
          id: 'microsoft/SmolVLM-500M',
          tags: [],
          downloads: 100,
          likes: 10,
          siblings: [
            { rfilename: 'SmolVLM-500M-Instruct-f16.gguf' },
            { rfilename: 'README.md' },
            { rfilename: 'mmproj-SmolVLM-500M-Instruct-f16.gguf' },
          ]
        },
      ];

      const result = (huggingFaceService as any).processSearchResults(testModels);

      expect(result[0].siblings).toHaveLength(2);
      expect(result[0].siblings[0].url).toContain('microsoft/SmolVLM-500M/resolve/main/');
      expect(result[0].siblings[0].rfilename).toBe('SmolVLM-500M-Instruct-f16.gguf');
    });
  });
});