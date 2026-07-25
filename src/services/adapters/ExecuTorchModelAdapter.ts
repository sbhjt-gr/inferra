import { ALL_MINILM_L6_V2 } from 'react-native-executorch';

export const minilmRemote = {
  modelUrl: String(ALL_MINILM_L6_V2.modelSource),
  tokenizerUrl: String(ALL_MINILM_L6_V2.tokenizerSource),
  modelFile: 'all_minilm_l6_v2_xnnpack_fp32.pte',
  tokenizerFile: 'tokenizer.json',
};
