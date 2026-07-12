export type AttachKind = 'image' | 'audio' | 'pdf' | 'document' | 'unknown';

export type FallbackMode = 'ocr' | 'stt' | 'extract';

export type AttachMode = 'native' | 'needs-mmproj' | 'needs-fallback' | 'unsupported';

export type DocPolicy = 'native-upload' | 'extract-text' | 'none';

export type TextFallback = {
  mode: FallbackMode;
  text: string;
};

export type ChatAttach = {
  id: string;
  kind: AttachKind;
  uri: string;
  name: string;
  mimeType: string;
  textFallback?: TextFallback;
  remoteFileUri?: string;
};

export type AttachEnvelope = {
  type: 'attachment';
  version: 1;
  attachments: ChatAttach[];
  userContent: string;
};

export type AttachCaps = {
  vision: boolean;
  audio: boolean;
  documents: DocPolicy;
  rag: boolean;
  needsMmproj: boolean;
  acceptMime: (mime: string, name: string) => boolean;
  modeFor: (kind: AttachKind) => AttachMode;
};
