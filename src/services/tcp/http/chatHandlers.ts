import { llamaManager } from '../../../utils/LlamaManager';
import { logger } from '../../../utils/logger';
import type { StoredModel } from '../../ModelDownloaderTypes';
import type { ModelSettings } from '../../ModelSettingsService';
import { parseJsonBody } from './jsonParser';
import { parseMessagesFromPayload, parseMessagesOrPromptFromPayload } from './messageParser';
import { buildCustomSettings } from './settingsBuilder';

export async function handleChatRequest(
  body: string,
  socket: any,
  method: string,
  path: string,
  ensureModelLoaded: (identifier?: string) => Promise<{ model: StoredModel; projectorPath?: string }>,
  parseHttpError: (error: unknown) => { status: number; code: string; message: string },
  streamChatResponse: (socket: any, method: string, path: string, model: StoredModel, messages: Array<{ role: string; content: string }>, settings?: ModelSettings) => Promise<void>,
  sendJSONResponse: (socket: any, status: number, payload: any) => void
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body);
  if (parseError) {
    sendJSONResponse(socket, 400, { error: parseError });
    logger.logWebRequest(method, path, 400);
    return;
  }

  const parsed = parseMessagesFromPayload(payload);
  if (parsed.error) {
    sendJSONResponse(socket, 400, { error: parsed.error });
    logger.logWebRequest(method, path, 400);
    return;
  }

  const modelIdentifier = typeof payload.model === 'string' ? payload.model : undefined;
  const stream = payload.stream === true;
  const settings = buildCustomSettings(payload.options);

  let target: { model: StoredModel; projectorPath?: string };

  try {
    target = await ensureModelLoaded(modelIdentifier);
  } catch (error) {
    const parsed = parseHttpError(error);
    const safeMessage = parsed.message.replace(/\s+/g, '_');
    logger.error(`api_chat_model:${safeMessage}`, 'webrtc');
    sendJSONResponse(socket, parsed.status, { error: parsed.code });
    logger.logWebRequest(method, path, parsed.status);
    return;
  }

  if (stream) {
    await streamChatResponse(socket, method, path, target.model, parsed.messages, settings);
    return;
  }

  try {
    const responseText = await llamaManager.generateResponse(parsed.messages, undefined, settings);
    sendJSONResponse(socket, 200, {
      model: target.model.name,
      created_at: new Date().toISOString(),
      response: responseText,
      done: true
    });
    logger.logWebRequest(method, path, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'generation_failed';
    const safeMessage = message.replace(/\s+/g, '_');
    logger.error(`api_chat_failed:${safeMessage}`, 'webrtc');
    sendJSONResponse(socket, 500, { error: 'generation_failed' });
    logger.logWebRequest(method, path, 500);
  }
}

export async function handleGenerateRequest(
  body: string,
  socket: any,
  method: string,
  path: string,
  ensureModelLoaded: (identifier?: string) => Promise<{ model: StoredModel; projectorPath?: string }>,
  parseHttpError: (error: unknown) => { status: number; code: string; message: string },
  streamChatResponse: (socket: any, method: string, path: string, model: StoredModel, messages: Array<{ role: string; content: string }>, settings?: ModelSettings) => Promise<void>,
  sendJSONResponse: (socket: any, status: number, payload: any) => void
): Promise<void> {
  const { payload, error: parseError } = parseJsonBody(body);
  if (parseError) {
    sendJSONResponse(socket, 400, { error: parseError });
    logger.logWebRequest(method, path, 400);
    return;
  }

  const parsed = parseMessagesOrPromptFromPayload(payload);
  if (parsed.error) {
    sendJSONResponse(socket, 400, { error: parsed.error });
    logger.logWebRequest(method, path, 400);
    return;
  }

  const modelIdentifier = typeof payload.model === 'string' ? payload.model : undefined;
  const stream = payload.stream === true;
  const settings = buildCustomSettings(payload.options);

  let target: { model: StoredModel; projectorPath?: string };

  try {
    target = await ensureModelLoaded(modelIdentifier);
  } catch (error) {
    const parsed = parseHttpError(error);
    const safeMessage = parsed.message.replace(/\s+/g, '_');
    logger.error(`api_generate_model:${safeMessage}`, 'webrtc');
    sendJSONResponse(socket, parsed.status, { error: parsed.code });
    logger.logWebRequest(method, path, parsed.status);
    return;
  }

  if (stream) {
    await streamChatResponse(socket, method, path, target.model, parsed.messages, settings);
    return;
  }

  try {
    const responseText = await llamaManager.generateResponse(parsed.messages, undefined, settings);
    sendJSONResponse(socket, 200, {
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
    sendJSONResponse(socket, 500, { error: 'generation_failed' });
    logger.logWebRequest(method, path, 500);
  }
}
