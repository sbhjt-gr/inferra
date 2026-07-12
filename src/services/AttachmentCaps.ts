import { Platform } from 'react-native';

import type { AttachCaps, AttachKind, AttachMode, DocPolicy } from '../types/attachment';
import { featureCaps } from './feature-availability';
import { engineService } from './runtime-service';
import { OnlineModelService } from './OnlineModelService';
import { isOpenAIUploadable } from './adapters/OpenAIFileAdapter';
import { isClaudeUploadable } from './adapters/ClaudeFileAdapter';
import { isGeminiUploadable, isGeminiImageFile } from './adapters/GeminiFileAdapter';
import { kindFromName } from './adapters/AttachStore';

type CapsOpts = {
  mmprojReady: boolean;
  llamaVision: boolean;
  llamaAudio: boolean;
  litertMultimodal?: boolean;
};

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif', 'heic', 'heif'];
const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'caf'];

const isImageName = (name: string) => {
  const ext = name.toLowerCase().split('.').pop() || '';
  return IMAGE_EXTS.includes(ext);
};

const isAudioName = (name: string) => {
  const ext = name.toLowerCase().split('.').pop() || '';
  return AUDIO_EXTS.includes(ext);
};

const remoteBase = (modelPath: string | null): string | null => {
  if (!modelPath) return null;
  if (modelPath === 'apple-foundation') return 'apple-foundation';
  try {
    return OnlineModelService.getBaseProvider(modelPath);
  } catch {
    return null;
  }
};

const isRemote = (modelPath: string | null): boolean => {
  const base = remoteBase(modelPath);
  return base === 'chatgpt' || base === 'claude' || base === 'gemini' || base === 'apple-foundation';
};

export const resolveAttachCaps = (
  modelPath: string | null,
  opts: CapsOpts,
): AttachCaps => {
  console.log('attach_caps_resolve', modelPath || 'none', opts.mmprojReady);

  if (!modelPath) {
    return emptyCaps();
  }

  if (isRemote(modelPath)) {
    return remoteCaps(modelPath);
  }

  const engine = engineService.getEngineForModel(modelPath);
  const base = featureCaps[engine];

  if (engine === 'llama') {
    const vision = opts.mmprojReady && opts.llamaVision;
    const audio = opts.mmprojReady && opts.llamaAudio;
    console.log('attach_caps_llama', vision, audio, opts.mmprojReady);
    return {
      vision,
      audio,
      documents: 'extract-text',
      rag: base.rag,
      needsMmproj: !opts.mmprojReady,
      acceptMime: (_mime, name) => true,
      modeFor: (kind: AttachKind): AttachMode => {
        if (kind === 'image') {
          if (!opts.mmprojReady) return 'needs-mmproj';
          return vision ? 'native' : 'needs-fallback';
        }
        if (kind === 'audio') {
          if (!opts.mmprojReady) return 'needs-mmproj';
          return audio ? 'native' : 'needs-fallback';
        }
        if (kind === 'pdf' || kind === 'document' || kind === 'unknown') {
          return 'native';
        }
        return 'unsupported';
      },
    };
  }

  if (engine === 'litert') {
    const vision = base.vision && !!opts.litertMultimodal;
    const audio = base.audio && !!opts.litertMultimodal;
    console.log('attach_caps_litert', vision, audio, Platform.OS);
    return {
      vision,
      audio,
      documents: 'extract-text',
      rag: base.rag,
      needsMmproj: false,
      acceptMime: (_mime, name) => true,
      modeFor: (kind: AttachKind): AttachMode => {
        if (kind === 'image') return vision ? 'native' : 'needs-fallback';
        if (kind === 'audio') return audio ? 'native' : 'needs-fallback';
        if (kind === 'pdf' || kind === 'document' || kind === 'unknown') return 'native';
        return 'unsupported';
      },
    };
  }

  console.log('attach_caps_mlx');
  return {
    vision: false,
    audio: false,
    documents: 'extract-text',
    rag: base.rag,
    needsMmproj: false,
    acceptMime: (_mime, name) => true,
    modeFor: (kind: AttachKind): AttachMode => {
      if (kind === 'image' || kind === 'audio') return 'needs-fallback';
      if (kind === 'pdf' || kind === 'document' || kind === 'unknown') return 'native';
      return 'unsupported';
    },
  };
};

const emptyCaps = (): AttachCaps => ({
  vision: false,
  audio: false,
  documents: 'none',
  rag: false,
  needsMmproj: false,
  acceptMime: () => false,
  modeFor: () => 'unsupported',
});

const remoteCaps = (modelPath: string): AttachCaps => {
  const base = remoteBase(modelPath);

  if (base === 'apple-foundation') {
    console.log('attach_caps_apple');
    return {
      vision: false,
      audio: false,
      documents: 'extract-text',
      rag: true,
      needsMmproj: false,
      acceptMime: (_mime, name) => {
        const kind = kindFromName(name);
        return kind !== 'audio';
      },
      modeFor: (kind: AttachKind): AttachMode => {
        if (kind === 'image') return 'needs-fallback';
        if (kind === 'audio') return 'unsupported';
        if (kind === 'pdf' || kind === 'document' || kind === 'unknown') return 'native';
        return 'unsupported';
      },
    };
  }

  if (base === 'chatgpt') {
    console.log('attach_caps_openai');
    return {
      vision: true,
      audio: false,
      documents: 'native-upload',
      rag: false,
      needsMmproj: false,
      acceptMime: (_mime, name) => isImageName(name) || isOpenAIUploadable(name),
      modeFor: (kind: AttachKind): AttachMode => {
        if (kind === 'image') return 'native';
        if (kind === 'audio') return 'unsupported';
        if (kind === 'pdf' || kind === 'document') return 'native';
        return 'needs-fallback';
      },
    };
  }

  if (base === 'claude') {
    console.log('attach_caps_claude');
    return {
      vision: true,
      audio: false,
      documents: 'native-upload',
      rag: false,
      needsMmproj: false,
      acceptMime: (_mime, name) => isImageName(name) || isClaudeUploadable(name),
      modeFor: (kind: AttachKind): AttachMode => {
        if (kind === 'image') return 'native';
        if (kind === 'audio') return 'unsupported';
        if (kind === 'pdf' || kind === 'document') return 'native';
        return 'unsupported';
      },
    };
  }

  if (base === 'gemini') {
    console.log('attach_caps_gemini');
    return {
      vision: true,
      audio: true,
      documents: 'native-upload',
      rag: false,
      needsMmproj: false,
      acceptMime: (_mime, name) => isGeminiUploadable(name) || isGeminiImageFile(name) || isAudioName(name),
      modeFor: (kind: AttachKind): AttachMode => {
        if (kind === 'image' || kind === 'audio') return 'native';
        if (kind === 'pdf' || kind === 'document') return 'native';
        return 'needs-fallback';
      },
    };
  }

  return emptyCaps();
};

export const docsPolicyLabel = (policy: DocPolicy): string => policy;
