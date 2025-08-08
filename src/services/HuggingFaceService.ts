import Constants from 'expo-constants';
import { HUGGINGFACE_TOKEN } from '@env';

interface HFModel {
  id: string;
  modelId: string;
  author: string;
  downloads: number;
  likes: number;
  updatedAt: string;
  tags: string[];
  disabled: boolean;
  gated: boolean;
  pipeline_tag?: string;
  library_name?: string;
}

interface HFFile {
  filename: string;
  size: number;
  downloadUrl: string;
  lastModified: string;
}

interface HFModelDetails extends HFModel {
  files: HFFile[];
  description?: string;
  cardData?: any;
}

interface SearchParams {
  query?: string;
  filter?: string;
  sort?: 'downloads' | 'likes' | 'updatedAt';
  direction?: 'asc' | 'desc';
  limit?: number;
}

class HuggingFaceService {
  private baseUrl = 'https://huggingface.co';
  private apiUrl = `${this.baseUrl}/api`;
  private token = HUGGINGFACE_TOKEN;

  constructor() {
    if (!this.token) {
      console.warn('[HuggingFaceService] No HUGGINGFACE_TOKEN found, using public access');
    }
  }

  private getHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  async searchModels(params: SearchParams = {}): Promise<HFModel[]> {
    try {
      const searchParams = new URLSearchParams();
      
      if (params.query) {
        searchParams.append('search', params.query);
      }
      
      if (params.limit) {
        searchParams.append('limit', params.limit.toString());
      } else {
        searchParams.append('limit', '20');
      }

      const url = `${this.apiUrl}/models?${searchParams.toString()}`;
      const headers = this.getHeaders();

      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HuggingFace API Error ${response.status}: ${errorText || response.statusText}`);
      }

      const models = await response.json();
      
      if (!Array.isArray(models)) {
        throw new Error('Invalid response format from HuggingFace API');
      }

      const filteredModels = models.filter((model: HFModel) => {
        const hasGgufTag = model.tags?.some(tag => 
          tag.toLowerCase().includes('gguf') || 
          tag.toLowerCase().includes('quantized')
        );
        const hasGgufLibrary = model.library_name === 'gguf';
        const nameHasGguf = model.id?.toLowerCase().includes('gguf');
        
        return hasGgufTag || hasGgufLibrary || nameHasGguf;
      });
      
      const sortedModels = filteredModels.sort((a, b) => {
        const downloadsA = a.downloads || 0;
        const downloadsB = b.downloads || 0;
        return downloadsB - downloadsA;
      });
      
      return sortedModels;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('Network request failed')) {
        throw new Error('Network connection failed. Please check your internet connection.');
      }
      throw error;
    }
  }

  async getModelFiles(modelId: string): Promise<HFFile[]> {
    try {
      const url = `${this.apiUrl}/models/${modelId}/tree/main`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const tree = await response.json();
      
      const ggufFiles = tree
        .filter((item: any) => {
          const isFile = item.type === 'file';
          const isGgufOrBin = item.path.endsWith('.gguf') || item.path.endsWith('.bin');
          return isFile && isGgufOrBin;
        })
        .map((file: any) => ({
          filename: file.path,
          size: file.size || 0,
          downloadUrl: `${this.baseUrl}/${modelId}/resolve/main/${file.path}`,
          lastModified: file.lastModified || new Date().toISOString(),
        }));

      return ggufFiles;
    } catch (error) {
      throw error;
    }
  }

  async getModelDetails(modelId: string): Promise<HFModelDetails> {
    try {
      const [modelResponse, files] = await Promise.all([
        fetch(`${this.apiUrl}/models/${modelId}`, {
          method: 'GET',
          headers: this.getHeaders(),
        }),
        this.getModelFiles(modelId)
      ]);

      if (!modelResponse.ok) {
        throw new Error(`HTTP ${modelResponse.status}: ${modelResponse.statusText}`);
      }

      const model = await modelResponse.json();
      
      return {
        ...model,
        files,
      };
    } catch (error) {
      throw error;
    }
  }

  getDownloadUrl(modelId: string, filename: string): string {
    return `${this.baseUrl}/${modelId}/resolve/main/${filename}`;
  }

  formatModelSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  extractQuantization(filename: string): string {
    const quantMatches = filename.match(/[qQ](\d+)_[kK]?[mM]?(\d*)/);
    if (quantMatches) {
      return `Q${quantMatches[1]}${quantMatches[2] ? `_K_M` : ''}`;
    }
    
    const f16Match = filename.match(/f16/i);
    if (f16Match) return 'F16';
    
    const f32Match = filename.match(/f32/i);
    if (f32Match) return 'F32';
    
    return 'Unknown';
  }

  validateModelUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === 'huggingface.co' && 
             (url.includes('.gguf') || url.includes('.bin'));
    } catch {
      return false;
    }
  }
}

export const huggingFaceService = new HuggingFaceService();
export type { HFModel, HFFile, HFModelDetails, SearchParams };