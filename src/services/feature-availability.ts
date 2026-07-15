import { EngineId, EngineCaps } from '../managers/inference-manager';

type FeatureId = keyof EngineCaps;

type FeatureMap = Record<EngineId, EngineCaps>;

const caps: FeatureMap = {
  llama: {
    embeddings: true,
    vision: true,
    audio: true,
    rag: true,
    grammar: true,
    jinja: true,
    dry: true,
    mirostat: true,
    xtc: true,
  },
  mlx: {
    embeddings: false,
    vision: false,
    audio: false,
    rag: true,
    grammar: false,
    jinja: false,
    dry: false,
    mirostat: false,
    xtc: false,
  },
  litert: {
    embeddings: false,
    vision: true,
    audio: true,
    rag: false,
    grammar: false,
    jinja: false,
    dry: false,
    mirostat: false,
    xtc: false,
  },
};

export const featureCaps = caps;

export const isFeatureOn = (engine: EngineId, feature: FeatureId) => caps[engine][feature];
