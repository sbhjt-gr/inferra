import type { ChatAttach } from '../types/attachment';
import { parseAttachMessage } from './AttachmentCompat';
import { createMultimodalMessage } from '../utils/ImageProcessingUtils';

export const normalizeAttachContent = (content: string): string => {
  const envelope = parseAttachMessage(content);
  if (!envelope) {
    return content;
  }

  console.log('attach_normalize', envelope.attachments.length);

  if (envelope.attachments.length === 0) {
    return envelope.userContent || content;
  }

  const texts: string[] = [];
  if (envelope.userContent.trim()) {
    texts.push(envelope.userContent.trim());
  }

  const images: ChatAttach[] = [];
  const audios: ChatAttach[] = [];
  const remotes: ChatAttach[] = [];

  for (const attach of envelope.attachments) {
    if (attach.textFallback?.text) {
      texts.push(attach.textFallback.text);
      continue;
    }
    if (attach.kind === 'image') {
      images.push(attach);
      continue;
    }
    if (attach.kind === 'audio') {
      audios.push(attach);
      continue;
    }
    if (attach.remoteFileUri || attach.uri) {
      remotes.push(attach);
    }
  }

  if (images.length === 1 && audios.length === 0 && remotes.length === 0 && texts.length <= 1) {
    return createMultimodalMessage(images[0].uri, texts[0] || 'Describe this image.');
  }

  if (images.length > 0) {
    const contentParts: any[] = images.map(img => ({ type: 'image', uri: img.uri }));
    for (const audio of audios) {
      contentParts.push({ type: 'audio', uri: audio.uri });
    }
    contentParts.push({ type: 'text', text: texts.join('\n\n') || 'Please process this media.' });
    return JSON.stringify({ type: 'multimodal', content: contentParts });
  }

  if (audios.length === 1 && remotes.length === 0) {
    return JSON.stringify({
      type: 'audio_upload',
      internalInstruction: `Audio URI: ${audios[0].uri}`,
      userContent: texts.join('\n\n') || 'Please transcribe or describe this audio file.',
      fileName: audios[0].name,
    });
  }

  if (audios.length > 0) {
    const contentParts: any[] = audios.map(a => ({ type: 'audio', uri: a.uri }));
    contentParts.push({ type: 'text', text: texts.join('\n\n') || 'Please process this audio.' });
    return JSON.stringify({ type: 'multimodal', content: contentParts });
  }

  if (remotes.length === 1) {
    const file = remotes[0];
    return JSON.stringify({
      type: 'file_upload',
      internalInstruction: file.textFallback?.text || '',
      userContent: texts.join('\n\n') || `Please analyze this file: ${file.name}`,
      fileName: file.name,
      metadata: {
        remoteFileUri: file.remoteFileUri || file.uri,
        mimeType: file.mimeType,
      },
    });
  }

  if (texts.length > 0) {
    return texts.join('\n\n');
  }

  return envelope.userContent || content;
};

export const normalizeAttachMessages = <T extends { role: string; content: string }>(
  messages: T[],
): T[] => {
  return messages.map(msg => {
    if (msg.role !== 'user' || typeof msg.content !== 'string') {
      return msg;
    }
    const next = normalizeAttachContent(msg.content);
    if (next === msg.content) {
      return msg;
    }
    console.log('attach_normalize_msg');
    return { ...msg, content: next };
  });
};
