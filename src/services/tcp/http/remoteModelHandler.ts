import type { ProviderType } from '../../ModelManagementService';
import { onlineModelService } from '../../OnlineModelService';
import providerKeyStorage from '../../../utils/ProviderKeyStorage';
import { logger } from '../../../utils/logger';
import type { ApiHandler, JsonResponder } from './apiTypes';

type RemoteProvider = Exclude<ProviderType, 'local' | 'apple-foundation'>;
type RemoteProviderState = {
  provider: RemoteProvider;
  configured: boolean;
  model: string | null;
  usingDefault: boolean;
};

type Context = {
  respond: JsonResponder;
};

const REMOTE_PROVIDERS: RemoteProvider[] = ['gemini', 'chatgpt', 'deepseek', 'claude'];
const REMOTE_MODELS_PREF_KEY = 'remote_models_enabled';

function normalizeRemoteProvider(value: any): RemoteProvider | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (REMOTE_PROVIDERS.includes(normalized as RemoteProvider)) {
    return normalized as RemoteProvider;
  }

  if (normalized === 'openai' || normalized.startsWith('gpt')) {
    return 'chatgpt';
  }

  if (normalized === 'anthropic' || normalized.startsWith('claude')) {
    return 'claude';
  }

  if (normalized.startsWith('gemini')) {
    return 'gemini';
  }

  if (normalized.startsWith('deepseek')) {
    return 'deepseek';
  }

  return null;
}

async function getRemoteModelsEnabled(): Promise<boolean> {
  try {
    await providerKeyStorage.initialize();
    const value = await providerKeyStorage.getPreference(REMOTE_MODELS_PREF_KEY);
    return value === 'true';
  } catch (error) {
    return false;
  }
}

async function getRemoteProviderState(provider: RemoteProvider): Promise<RemoteProviderState> {
  try {
    const configured = await onlineModelService.hasApiKey(provider);
    const modelName = await onlineModelService.getModelName(provider);
    const usingDefault = await onlineModelService.isUsingDefaultKey(provider);
    const resolvedModel = modelName ?? onlineModelService.getDefaultModelName(provider);
    return {
      provider,
      configured,
      model: resolvedModel,
      usingDefault,
    };
  } catch (error) {
    return {
      provider,
      configured: false,
      model: null,
      usingDefault: false,
    };
  }
}

async function buildRemoteProviderSummaries(): Promise<RemoteProviderState[]> {
  const results: RemoteProviderState[] = [];
  for (const provider of REMOTE_PROVIDERS) {
    const state = await getRemoteProviderState(provider);
    results.push(state);
  }
  return results;
}

function getRemoteProviderLabel(provider: RemoteProvider): string {
  switch (provider) {
    case 'gemini':
      return 'Gemini';
    case 'chatgpt':
      return 'OpenAI';
    case 'deepseek':
      return 'DeepSeek';
    case 'claude':
      return 'Anthropic Claude';
    default:
      return provider;
  }
}

export function createRemoteModelHandler(context: Context): ApiHandler {
  return async (method, segments, body, socket, path) => {
    if (segments.length > 1) {
      context.respond(socket, 404, { error: 'not_found' });
      logger.logWebRequest(method, path, 404);
      return true;
    }

    const segment = segments[0];
    const providerFromPath = segment ? normalizeRemoteProvider(segment) : null;
    if (segment && !providerFromPath) {
      context.respond(socket, 404, { error: 'provider_not_found' });
      logger.logWebRequest(method, path, 404);
      return true;
    }

    if (method === 'GET') {
      const enabled = await getRemoteModelsEnabled();

      if (providerFromPath) {
        const summary = await getRemoteProviderState(providerFromPath);
        context.respond(socket, 200, {
          enabled,
          provider: summary,
          message: enabled
            ? 'Remote models are enabled.'
            : 'Enable remote models in settings to activate providers.',
        });
        logger.logWebRequest(method, path, 200);
        return true;
      }

      const summaries = await buildRemoteProviderSummaries();
      context.respond(socket, 200, {
        enabled,
        providers: summaries,
        message: enabled
          ? 'Remote models are enabled.'
          : 'Enable remote models in settings to activate providers.',
      });
      logger.logWebRequest(method, path, 200);
      return true;
    }

    if (method === 'POST') {
      const enabled = await getRemoteModelsEnabled();
      if (!enabled) {
        context.respond(socket, 409, {
          error: 'remote_models_disabled',
          message: 'Enable remote models in settings on the device.'
        });
        logger.logWebRequest(method, path, 409);
        return true;
      }

      let target = providerFromPath;

      if (!target) {
        if (!body) {
          context.respond(socket, 400, { error: 'provider_required' });
          logger.logWebRequest(method, path, 400);
          return true;
        }

        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch (error) {
          context.respond(socket, 400, { error: 'invalid_json' });
          logger.logWebRequest(method, path, 400);
          return true;
        }

        target = normalizeRemoteProvider(payload?.provider);
        if (!target) {
          context.respond(socket, 400, { error: 'invalid_provider' });
          logger.logWebRequest(method, path, 400);
          return true;
        }
      } else if (body) {
        try {
          JSON.parse(body);
        } catch (error) {
          context.respond(socket, 400, { error: 'invalid_json' });
          logger.logWebRequest(method, path, 400);
          return true;
        }
      }

      try {
        const hasKey = await onlineModelService.hasApiKey(target);
        if (!hasKey) {
          const label = getRemoteProviderLabel(target);
          context.respond(socket, 422, {
            error: 'api_key_missing',
            message: `Add a ${label} API key in settings before using this provider.`,
          });
          logger.logWebRequest(method, path, 422);
          return true;
        }

        const summary = await getRemoteProviderState(target);
        context.respond(socket, 200, { status: 'ready', provider: summary });
        logger.logWebRequest(method, path, 200);
        return true;
      } catch (error) {
        context.respond(socket, 500, { error: 'remote_provider_check_failed' });
        logger.logWebRequest(method, path, 500);
        return true;
      }
    }

    context.respond(socket, 405, { error: 'method_not_allowed' });
    logger.logWebRequest(method, path, 405);
    return true;
  };
}
