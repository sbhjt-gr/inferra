import { Platform } from 'react-native';

import { AppleTranscription } from '@react-native-ai/apple';
import { fs as FileSystem } from '../fs';

const base64ToBuffer = (base64: string): ArrayBuffer => {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

class SttAdapterClass {
  isReady(language = 'en-US'): boolean {
    if (Platform.OS !== 'ios') {
      console.log('stt_unavailable_platform');
      return false;
    }
    try {
      const ready = AppleTranscription.isAvailable(language);
      console.log('stt_ready', ready);
      return ready;
    } catch {
      console.log('stt_ready_error');
      return false;
    }
  }

  async transcribe(uri: string, language = 'en-US'): Promise<string> {
    console.log('stt_start');
    if (!this.isReady(language)) {
      throw new Error('stt_unavailable');
    }
    await AppleTranscription.prepare(language);
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const buffer = base64ToBuffer(base64);
    const result = await AppleTranscription.transcribe(buffer, language);
    const text = (result.segments || []).map(s => s.text).join(' ').trim();
    console.log('stt_done', text.length);
    if (!text) {
      throw new Error('stt_empty');
    }
    return text;
  }
}

export const sttAdapter = new SttAdapterClass();
