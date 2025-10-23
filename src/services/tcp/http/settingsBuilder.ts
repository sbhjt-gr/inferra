import { llamaManager } from '../../../utils/LlamaManager';
import type { ModelSettings } from '../../ModelSettingsService';

export function buildCustomSettings(options: any): ModelSettings | undefined {
  if (!options || typeof options !== 'object') {
    return undefined;
  }

  const base = llamaManager.getSettings();
  let changed = false;

  if (Object.prototype.hasOwnProperty.call(options, 'temperature') && typeof options.temperature === 'number') {
    base.temperature = options.temperature;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'top_p') && typeof options.top_p === 'number') {
    base.topP = options.top_p;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'top_k') && typeof options.top_k === 'number') {
    base.topK = options.top_k;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'min_p') && typeof options.min_p === 'number') {
    base.minP = options.min_p;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'num_predict') && typeof options.num_predict === 'number') {
    base.maxTokens = options.num_predict;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'seed') && typeof options.seed === 'number') {
    base.seed = options.seed;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'repeat_penalty') && typeof options.repeat_penalty === 'number') {
    base.penaltyRepeat = options.repeat_penalty;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'frequency_penalty') && typeof options.frequency_penalty === 'number') {
    base.penaltyFreq = options.frequency_penalty;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'presence_penalty') && typeof options.presence_penalty === 'number') {
    base.penaltyPresent = options.presence_penalty;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'penalty_last_n') && typeof options.penalty_last_n === 'number') {
    base.penaltyLastN = options.penalty_last_n;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'mirostat') && typeof options.mirostat === 'number') {
    base.mirostat = options.mirostat;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'mirostat_tau') && typeof options.mirostat_tau === 'number') {
    base.mirostatTau = options.mirostat_tau;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'mirostat_eta') && typeof options.mirostat_eta === 'number') {
    base.mirostatEta = options.mirostat_eta;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'typical_p') && typeof options.typical_p === 'number') {
    base.typicalP = options.typical_p;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'n_probs') && typeof options.n_probs === 'number') {
    base.nProbs = options.n_probs;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'dry_multiplier') && typeof options.dry_multiplier === 'number') {
    base.dryMultiplier = options.dry_multiplier;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'dry_base') && typeof options.dry_base === 'number') {
    base.dryBase = options.dry_base;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'dry_allowed_length') && typeof options.dry_allowed_length === 'number') {
    base.dryAllowedLength = options.dry_allowed_length;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'dry_penalty_last_n') && typeof options.dry_penalty_last_n === 'number') {
    base.dryPenaltyLastN = options.dry_penalty_last_n;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'dry_sequence_breakers') && Array.isArray(options.dry_sequence_breakers)) {
    base.drySequenceBreakers = options.dry_sequence_breakers.filter((item: any) => typeof item === 'string');
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'ignore_eos') && typeof options.ignore_eos === 'boolean') {
    base.ignoreEos = options.ignore_eos;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'enable_thinking') && typeof options.enable_thinking === 'boolean') {
    base.enableThinking = options.enable_thinking;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'xtc_probability') && typeof options.xtc_probability === 'number') {
    base.xtcProbability = options.xtc_probability;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'xtc_threshold') && typeof options.xtc_threshold === 'number') {
    base.xtcThreshold = options.xtc_threshold;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'jinja') && typeof options.jinja === 'boolean') {
    base.jinja = options.jinja;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'grammar') && typeof options.grammar === 'string') {
    base.grammar = options.grammar;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'system_prompt') && typeof options.system_prompt === 'string') {
    base.systemPrompt = options.system_prompt;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'stop') && Array.isArray(options.stop)) {
    const words = options.stop.filter((item: any) => typeof item === 'string');
    if (words.length > 0) {
      base.stopWords = words;
      changed = true;
    }
  } else if (Object.prototype.hasOwnProperty.call(options, 'stop') && typeof options.stop === 'string') {
    base.stopWords = [options.stop];
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'stop_words') && Array.isArray(options.stop_words)) {
    const words = options.stop_words.filter((item: any) => typeof item === 'string');
    if (words.length > 0) {
      base.stopWords = words;
      changed = true;
    }
  } else if (Object.prototype.hasOwnProperty.call(options, 'stop_words') && typeof options.stop_words === 'string') {
    base.stopWords = [options.stop_words];
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'logit_bias') && Array.isArray(options.logit_bias)) {
    base.logitBias = options.logit_bias;
    changed = true;
  }

  return changed ? base : undefined;
}
