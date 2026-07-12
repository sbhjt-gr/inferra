import type { AttachCaps, AttachEnvelope, ChatAttach } from '../types/attachment';
import { parseAttachMessage } from './AttachmentCompat';

export type ResolvedAttach = {
  userContent: string;
  images: string[];
  audios: string[];
  textParts: string[];
  remoteUploads: ChatAttach[];
  needsChoice: ChatAttach[];
};

export const resolveAttach = (
  raw: string,
  caps: AttachCaps,
): ResolvedAttach | null => {
  const envelope = parseAttachMessage(raw);
  if (!envelope) return null;
  console.log('attach_resolve_start', envelope.attachments.length);
  return resolveEnvelope(envelope, caps);
};

export const resolveEnvelope = (
  envelope: AttachEnvelope,
  caps: AttachCaps,
): ResolvedAttach => {
  const images: string[] = [];
  const audios: string[] = [];
  const textParts: string[] = [];
  const remoteUploads: ChatAttach[] = [];
  const needsChoice: ChatAttach[] = [];

  for (const attach of envelope.attachments) {
    if (attach.textFallback?.text) {
      console.log('attach_resolve_fallback', attach.kind, attach.textFallback.mode);
      textParts.push(attach.textFallback.text);
      continue;
    }

    const mode = caps.modeFor(attach.kind);
    console.log('attach_resolve_mode', attach.kind, mode);

    if (mode === 'native') {
      if (attach.kind === 'image') {
        images.push(attach.uri);
        continue;
      }
      if (attach.kind === 'audio') {
        audios.push(attach.uri);
        continue;
      }
      if (caps.documents === 'native-upload') {
        remoteUploads.push(attach);
        continue;
      }
      if (attach.textFallback?.text) {
        textParts.push(attach.textFallback.text);
      }
      continue;
    }

    if (mode === 'needs-mmproj' || mode === 'needs-fallback' || mode === 'unsupported') {
      needsChoice.push(attach);
    }
  }

  console.log('attach_resolve_done', images.length, audios.length, needsChoice.length);
  return {
    userContent: envelope.userContent,
    images,
    audios,
    textParts,
    remoteUploads,
    needsChoice,
  };
};

export const toPromptText = (resolved: ResolvedAttach): string => {
  const parts = [...resolved.textParts];
  if (resolved.userContent.trim()) {
    parts.push(resolved.userContent.trim());
  }
  return parts.join('\n\n');
};
