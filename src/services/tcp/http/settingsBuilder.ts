import type { ModelSettings } from '../../ModelSettingsService';
import { DEFAULT_SETTINGS } from '../../../config/llamaConfig';

const num = (value: any) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

export function buildCustomSettings(opts: any): ModelSettings | undefined {
  if (!opts || typeof opts !== 'object') {
    return undefined;
  }

  const cfg: ModelSettings = {
    ...DEFAULT_SETTINGS,
    stopWords: [...DEFAULT_SETTINGS.stopWords],
    drySequenceBreakers: [...DEFAULT_SETTINGS.drySequenceBreakers],
    logitBias: DEFAULT_SETTINGS.logitBias.map(entry => [...entry])
  };
  let changed = false;

  const apply = (key: keyof ModelSettings, val: any) => {
    const v = num(val);
    if (v === undefined) {
      return;
    }
    (cfg as any)[key] = v;
    changed = true;
  };

  apply('temperature', opts.temperature ?? opts.temp);
  apply('topP', opts.top_p);
  apply('topK', opts.top_k);
  apply('minP', opts.min_p);
  apply('maxTokens', opts.max_tokens);
  apply('seed', opts.seed);
  apply('mirostat', opts.mirostat);
  apply('mirostatTau', opts.mirostat_tau);
  apply('mirostatEta', opts.mirostat_eta);
  apply('penaltyRepeat', opts.penalty_repeat);
  apply('penaltyFreq', opts.frequency_penalty ?? opts.penalty_freq);
  apply('penaltyPresent', opts.presence_penalty ?? opts.penalty_present);
  apply('penaltyLastN', opts.penalty_last_n);
  apply('dryMultiplier', opts.dry_multiplier);
  apply('dryBase', opts.dry_base);
  apply('dryAllowedLength', opts.dry_allowed_length);
  apply('dryPenaltyLastN', opts.dry_penalty_last_n);
  apply('xtcProbability', opts.xtc_probability);
  apply('xtcThreshold', opts.xtc_threshold);
  apply('typicalP', opts.typical_p);

  if (Array.isArray(opts.stop)) {
    const list = opts.stop.filter((item: any) => typeof item === 'string' && item.length > 0);
    if (list.length > 0) {
      cfg.stopWords = list;
      changed = true;
    }
  } else if (typeof opts.stop === 'string' && opts.stop.length > 0) {
    cfg.stopWords = [opts.stop];
    changed = true;
  }

  if (typeof opts.system_prompt === 'string') {
    cfg.systemPrompt = opts.system_prompt;
    changed = true;
  }

  if (changed) {
    return cfg;
  }
  return undefined;
}
