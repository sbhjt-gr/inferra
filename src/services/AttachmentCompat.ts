import type { AttachEnvelope, ChatAttach, TextFallback } from '../types/attachment';
import { kindFromName, mimeFromName } from './adapters/AttachStore';

export const isAttachEnvelope = (value: unknown): value is AttachEnvelope => {
  if (!value || typeof value !== 'object') return false;
  const obj = value as AttachEnvelope;
  return obj.type === 'attachment' && obj.version === 1 && Array.isArray(obj.attachments);
};

export const parseAttachMessage = (raw: string): AttachEnvelope | null => {
  try {
    const parsed = JSON.parse(raw);
    if (isAttachEnvelope(parsed)) {
      console.log('attach_parse_ok', parsed.attachments.length);
      return parsed;
    }
    return fromLegacy(parsed);
  } catch {
    return null;
  }
};

export const buildAttachMessage = (
  attachments: ChatAttach[],
  userContent: string,
): string => {
  const envelope: AttachEnvelope = {
    type: 'attachment',
    version: 1,
    attachments,
    userContent,
  };
  console.log('attach_build', attachments.length);
  return JSON.stringify(envelope);
};

export const withFallback = (
  attach: ChatAttach,
  fallback: TextFallback,
): ChatAttach => ({
  ...attach,
  textFallback: fallback,
});

const fromLegacy = (parsed: any): AttachEnvelope | null => {
  if (!parsed || typeof parsed !== 'object' || !parsed.type) return null;

  if (parsed.type === 'multimodal' && Array.isArray(parsed.content)) {
    console.log('attach_legacy_multimodal');
    const textPart = parsed.content.find((p: any) => p.type === 'text');
    const imagePart = parsed.content.find((p: any) => p.type === 'image');
    const audioPart = parsed.content.find((p: any) => p.type === 'audio');
    const attachments: ChatAttach[] = [];
    if (imagePart?.uri) {
      attachments.push({
        id: `legacy-img-${Date.now()}`,
        kind: 'image',
        uri: imagePart.uri,
        name: 'image',
        mimeType: 'image/jpeg',
      });
    }
    if (audioPart?.uri) {
      attachments.push({
        id: `legacy-aud-${Date.now()}`,
        kind: 'audio',
        uri: audioPart.uri,
        name: 'audio',
        mimeType: 'audio/mpeg',
      });
    }
    return {
      type: 'attachment',
      version: 1,
      attachments,
      userContent: textPart?.text || '',
    };
  }

  if (parsed.type === 'audio_upload') {
    console.log('attach_legacy_audio');
    const uriMatch = typeof parsed.internalInstruction === 'string'
      ? parsed.internalInstruction.match(/Audio URI:\s*(.+)/i)
      : null;
    const uri = uriMatch?.[1]?.trim() || '';
    return {
      type: 'attachment',
      version: 1,
      attachments: uri
        ? [{
            id: `legacy-audio-${Date.now()}`,
            kind: 'audio',
            uri,
            name: parsed.fileName || 'audio',
            mimeType: mimeFromName(parsed.fileName || 'audio.m4a'),
          }]
        : [],
      userContent: parsed.userContent || '',
    };
  }

  if (parsed.type === 'ocr_result') {
    console.log('attach_legacy_ocr');
    const attach: ChatAttach = {
      id: `legacy-ocr-${Date.now()}`,
      kind: 'image',
      uri: parsed.imageUri || '',
      name: parsed.fileName || 'image',
      mimeType: 'image/jpeg',
      textFallback: {
        mode: 'ocr',
        text: parsed.extractedText || '',
      },
    };
    return {
      type: 'attachment',
      version: 1,
      attachments: attach.uri ? [attach] : [],
      userContent: parsed.userPrompt || '',
    };
  }

  if (parsed.type === 'file_upload') {
    console.log('attach_legacy_file');
    const name = parsed.fileName || 'file';
    const kind = kindFromName(name);
    const attach: ChatAttach = {
      id: `legacy-file-${Date.now()}`,
      kind,
      uri: parsed.metadata?.remoteFileUri || '',
      name,
      mimeType: parsed.metadata?.mimeType || mimeFromName(name),
      remoteFileUri: parsed.metadata?.remoteFileUri,
      textFallback: parsed.internalInstruction
        ? { mode: 'extract', text: parsed.internalInstruction }
        : undefined,
    };
    return {
      type: 'attachment',
      version: 1,
      attachments: [attach],
      userContent: parsed.userContent || '',
    };
  }

  return null;
};
