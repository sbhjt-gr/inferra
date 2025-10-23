import { llamaManager } from '../../../utils/LlamaManager';
import { logger } from '../../../utils/logger';
import type { StoredModel } from '../../ModelDownloaderTypes';
import type { ModelSettings } from '../../ModelSettingsService';

type StreamChatCallback = (
  socket: any,
  method: string,
  path: string,
  model: StoredModel,
  messages: Array<{ role: string; content: string }>,
  settings?: ModelSettings
) => Promise<void>;

type EnsureModelLoadedFn = (identifier?: string) => Promise<{ model: StoredModel; projectorPath?: string }>;
type ParseHttpErrorFn = (error: unknown) => { status: number; code: string; message: string };
type BuildCustomSettingsFn = (options: any) => ModelSettings | undefined;

type Context = {
  respond: (socket: any, status: number, payload: any) => void;
  ensureModelLoaded: EnsureModelLoadedFn;
  parseHttpError: ParseHttpErrorFn;
  buildCustomSettings: BuildCustomSettingsFn;
  streamChatResponse: StreamChatCallback;
};

function parseMessagesForGenerate(payload: any): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  const systemInputs: string[] = [];

  if (typeof payload.system === 'string' && payload.system.length > 0) {
    systemInputs.push(payload.system);
  }

  if (payload.options && typeof payload.options.system_prompt === 'string' && payload.options.system_prompt.length > 0) {
    systemInputs.push(payload.options.system_prompt);
  }

  if (Array.isArray(payload.messages) && payload.messages.length > 0) {
    for (const entry of payload.messages) {
      if (!entry || typeof entry.role !== 'string') {
        continue;
      }

      let content = '';

      if (typeof entry.content === 'string') {
        content = entry.content;
      } else if (Array.isArray(entry.content)) {
        content = entry.content
          .map((item: any) => {
            if (typeof item === 'string') {
              return item;
            }
            if (item && typeof item.text === 'string') {
              return item.text;
            }
            return '';
          })
          .filter((value: string) => value.length > 0)
          .join(' ');
      } else if (entry.content && typeof entry.content === 'object' && typeof entry.content.text === 'string') {
        content = entry.content.text;
      } else if (entry.content !== undefined && entry.content !== null) {
        content = String(entry.content);
      }

      messages.push({ role: entry.role, content });
    }
  } else if (typeof payload.prompt === 'string') {
    messages.push({ role: 'user', content: payload.prompt });
  }

  for (let index = systemInputs.length - 1; index >= 0; index -= 1) {
    const systemContent = systemInputs[index];
    messages.unshift({ role: 'system', content: systemContent });
  }

  return messages;
}

export function createGenerateHandler(context: Context) {
  return async (method: string, path: string, body: string, socket: any): Promise<boolean> => {
    if (method !== 'POST' || path !== '/api/generate') {
      return false;
    }

    if (!body) {
      context.respond(socket, 400, { error: 'empty_body' });
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

    const messages = parseMessagesForGenerate(payload);

    if (messages.length === 0) {
      context.respond(socket, 400, { error: 'prompt_required' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    const modelIdentifier = typeof payload.model === 'string' ? payload.model : undefined;
    const stream = payload.stream === true;
    const settings = context.buildCustomSettings(payload.options);

    let target: { model: StoredModel; projectorPath?: string };

    try {
      target = await context.ensureModelLoaded(modelIdentifier);
    } catch (error) {
      const parsed = context.parseHttpError(error);
      const safeMessage = parsed.message.replace(/\s+/g, '_');
      logger.error(`api_generate_model:${safeMessage}`, 'webrtc');
      context.respond(socket, parsed.status, { error: parsed.code });
      logger.logWebRequest(method, path, parsed.status);
      return true;
    }

    if (stream) {
      await context.streamChatResponse(socket, method, path, target.model, messages, settings);
      return true;
    }

    try {
      const responseText = await llamaManager.generateResponse(messages, undefined, settings);
      context.respond(socket, 200, {
        model: target.model.name,
        created_at: new Date().toISOString(),
        response: responseText,
        done: true
      });
      logger.logWebRequest(method, path, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'generation_failed';
      const safeMessage = message.replace(/\s+/g, '_');
      logger.error(`api_generate_failed:${safeMessage}`, 'webrtc');
      context.respond(socket, 500, { error: 'generation_failed' });
      logger.logWebRequest(method, path, 500);
    }
    return true;
  };
}
