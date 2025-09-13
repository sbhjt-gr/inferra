import { Platform } from 'react-native';
import { type LlamaContext } from 'llama.rn';
import * as FileSystem from 'expo-file-system';
import { 
  ProcessedMessage, 
  MultimodalContent, 
  MultimodalSupport 
} from '../types/llama';

export class MultimodalService {
  private isMultimodalEnabled: boolean = false;
  private multimodalSupport: MultimodalSupport = { vision: false, audio: false };
  private mmProjectorPath: string | null = null;

  async initMultimodal(
    context: LlamaContext, 
    mmProjectorPath: string
  ): Promise<boolean> {
    try {
      if (!context) {
        throw new Error('Base model context must be initialized before multimodal');
      }

      let finalProjectorPath = mmProjectorPath;
      if (finalProjectorPath.startsWith('file://')) {
        finalProjectorPath = finalProjectorPath.slice(7);
      }

      const success = await context.initMultimodal({
        path: finalProjectorPath,
        use_gpu: Platform.OS === 'ios' ? true : false,
      });

      if (success) {
        try {
          this.isMultimodalEnabled = await context.isMultimodalEnabled();
          this.multimodalSupport = await context.getMultimodalSupport();
          this.mmProjectorPath = finalProjectorPath;
        } catch (statusError) {
          this.isMultimodalEnabled = false;
          this.multimodalSupport = { vision: false, audio: false };
          return false;
        }
      } else {
        this.isMultimodalEnabled = false;
        this.multimodalSupport = { vision: false, audio: false };
      }

      return success;
    } catch (error) {
      this.isMultimodalEnabled = false;
      this.multimodalSupport = { vision: false, audio: false };
      return false;
    }
  }

  async releaseMultimodal(context: LlamaContext): Promise<void> {
    try {
      if (context && this.isMultimodalEnabled) {
        await context.releaseMultimodal();
        this.isMultimodalEnabled = false;
        this.multimodalSupport = { vision: false, audio: false };
      }
    } catch (error) {
    }
  }

  parseMultimodalMessage(message: string): ProcessedMessage {
    try {
      const parsed = JSON.parse(message);
      
      if (parsed.type === 'multimodal' && parsed.content && Array.isArray(parsed.content)) {
        const result: ProcessedMessage = { text: '', images: [], audioFiles: [] };
        
        for (const item of parsed.content) {
          if (item.type === 'text') {
            result.text = item.text || '';
          } else if (item.type === 'image' && item.uri) {
            result.images = result.images || [];
            result.images.push(item.uri);
          } else if (item.type === 'audio' && item.uri) {
            result.audioFiles = result.audioFiles || [];
            result.audioFiles.push(item.uri);
          }
        }
        
        return result;
      }
      
      if (parsed.type === 'photo_upload') {
        const imageUri = this.extractImageUri(parsed.internalInstruction);
        return {
          text: parsed.userContent || 'What do you see in this image?',
          images: imageUri ? [imageUri] : [],
        };
      } else if (parsed.type === 'file_upload') {
        return {
          text: parsed.internalInstruction + '\n\n' + (parsed.userContent || ''),
        };
      } else if (parsed.type === 'audio_upload') {
        const audioUri = this.extractAudioUri(parsed.internalInstruction);
        return {
          text: parsed.userContent || 'Transcribe or describe this audio:',
          audioFiles: audioUri ? [audioUri] : [],
        };
      }
    } catch (error) {
    }

    return { text: message };
  }

  private extractImageUri(instruction: string): string | null {
    const uriMatch = instruction.match(/Photo URI:\s*(.+)/);
    return uriMatch ? uriMatch[1].trim() : null;
  }

  private extractAudioUri(instruction: string): string | null {
    const uriMatch = instruction.match(/Audio URI:\s*(.+)/);
    return uriMatch ? uriMatch[1].trim() : null;
  }

  private async convertFileToBase64(fileUri: string): Promise<string | null> {
    try {
      const fileContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return fileContent;
    } catch (error) {
      return null;
    }
  }

  private getFileExtension(filePath: string): string {
    return filePath.split('.').pop()?.toLowerCase() || '';
  }

  private getMimeType(extension: string): string {
    const mimeTypes: { [key: string]: string } = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'wav': 'audio/wav',
      'mp3': 'audio/mp3',
      'm4a': 'audio/mp4',
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  async createMultimodalContent(processed: ProcessedMessage): Promise<MultimodalContent[]> {
    const content: MultimodalContent[] = [];

    content.push({
      type: 'text',
      text: processed.text,
    });

    if (processed.images && processed.images.length > 0 && this.multimodalSupport.vision) {
      for (const imageUri of processed.images) {
        try {
          let cleanPath = imageUri;
          if (cleanPath.startsWith('file://')) {
            cleanPath = cleanPath.slice(7);
          }
          
          content.push({
            type: 'image_url',
            image_url: {
              url: cleanPath,
            },
          });
        } catch (error) {
        }
      }
    }

    if (processed.audioFiles && processed.audioFiles.length > 0 && this.multimodalSupport.audio) {
      for (const audioUri of processed.audioFiles) {
        try {
          let cleanPath = audioUri;
          if (cleanPath.startsWith('file://')) {
            cleanPath = cleanPath.slice(7);
          }
          
          const extension = this.getFileExtension(audioUri);
          
          const validFormats: ('wav' | 'mp3' | 'm4a')[] = ['wav', 'mp3', 'm4a'];
          const format = validFormats.includes(extension as any) ? extension as 'wav' | 'mp3' | 'm4a' : 'm4a';
          
          content.push({
            type: 'input_audio',
            input_audio: {
              url: cleanPath,
              format: format,
            },
          });
        } catch (error) {
        }
      }
    }

    return content;
  }

  isMultimodalInitialized(): boolean {
    return this.isMultimodalEnabled;
  }

  getMultimodalSupport(): MultimodalSupport {
    return { ...this.multimodalSupport };
  }

  getMultimodalProjectorPath(): string | null {
    return this.mmProjectorPath;
  }

  hasVisionSupport(): boolean {
    return this.isMultimodalEnabled && this.multimodalSupport.vision;
  }

  hasAudioSupport(): boolean {
    return this.isMultimodalEnabled && this.multimodalSupport.audio;
  }
}
