import { v4 as uuidv4 } from 'uuid';

import { fs as FileSystem } from '../fs';
import { getMimeType } from './OpenAIFileAdapter';
import { getFileType } from '../../utils/fileUtils';
import type { AttachKind, ChatAttach } from '../../types/attachment';

const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'caf'];

export const kindFromName = (name: string): AttachKind => {
  const fileType = getFileType(name);
  if (fileType === 'image') return 'image';
  if (fileType === 'pdf') return 'pdf';
  if (fileType === 'text') return 'document';
  const ext = name.toLowerCase().split('.').pop() || '';
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  return 'unknown';
};

export const mimeFromName = (name: string): string => {
  const kind = kindFromName(name);
  if (kind === 'audio') {
    const ext = name.toLowerCase().split('.').pop() || '';
    const map: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      caf: 'audio/x-caf',
    };
    return map[ext] || 'audio/mpeg';
  }
  return getMimeType(name);
};

class AttachStoreClass {
  private uploadsDir(): string {
    return `${FileSystem.documentDirectory}uploads`;
  }

  async ensureDir(): Promise<void> {
    const dir = this.uploadsDir();
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      console.log('attach_dir_create');
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }

  async stage(uri: string, name: string): Promise<ChatAttach> {
    console.log('attach_stage_start', name);
    await this.ensureDir();
    const id = uuidv4();
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const dest = `${this.uploadsDir()}/${id}_${safeName}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    const attach: ChatAttach = {
      id,
      kind: kindFromName(name),
      uri: dest,
      name,
      mimeType: mimeFromName(name),
    };
    console.log('attach_stage_done', attach.kind, attach.id);
    return attach;
  }
}

export const attachStore = new AttachStoreClass();
