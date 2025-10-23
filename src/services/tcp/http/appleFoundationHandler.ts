import { Platform } from 'react-native';
import { appleFoundationService } from '../../AppleFoundationService';
import { logger } from '../../../utils/logger';
import type { ApiHandler, JsonResponder } from './apiTypes';

type Context = {
  respond: JsonResponder;
};

function buildAppleFoundationMessage(available: boolean, enabled: boolean, meetsRequirements: boolean): string {
  if (!available) {
    if (Platform.OS === 'ios') {
      return 'Apple Foundation is not available on this device.';
    }
    return 'Apple Foundation is only available on supported Apple devices.';
  }

  if (!meetsRequirements) {
    return 'Update the device to meet Apple Intelligence requirements, then enable Apple Foundation in settings.';
  }

  if (!enabled) {
    return 'Enable Apple Foundation in settings on this device before using this endpoint.';
  }

  return 'Apple Foundation is ready to use.';
}

export function createAppleFoundationHandler(context: Context): ApiHandler {
  return async (method, segments, body, socket, path) => {
    if (segments.length > 0) {
      context.respond(socket, 404, { error: 'not_found' });
      logger.logWebRequest(method, path, 404);
      return true;
    }

    const available = appleFoundationService.isAvailable();
    const meetsRequirements = appleFoundationService.meetsMinimumRequirements();
    const enabled = available ? await appleFoundationService.isEnabled() : false;

    if (method === 'GET') {
      const message = buildAppleFoundationMessage(available, enabled, meetsRequirements);
      context.respond(socket, 200, {
        available,
        requirementsMet: meetsRequirements,
        enabled,
        status: available && enabled ? 'ready' : 'configure',
        message,
      });
      logger.logWebRequest(method, path, 200);
      return true;
    }

    if (method === 'POST') {
      if (body) {
        try {
          JSON.parse(body);
        } catch (error) {
          context.respond(socket, 400, { error: 'invalid_json' });
          logger.logWebRequest(method, path, 400);
          return true;
        }
      }

      if (!available) {
        context.respond(socket, 501, {
          error: 'apple_foundation_unavailable',
          message: 'Apple Foundation is not available on this device.',
        });
        logger.logWebRequest(method, path, 501);
        return true;
      }

      if (!meetsRequirements) {
        context.respond(socket, 428, {
          error: 'requirements_not_met',
          message: 'Update the device to meet Apple Intelligence requirements.',
        });
        logger.logWebRequest(method, path, 428);
        return true;
      }

      if (!enabled) {
        context.respond(socket, 409, {
          error: 'apple_foundation_disabled',
          message: 'Enable Apple Foundation in settings on this device.',
        });
        logger.logWebRequest(method, path, 409);
        return true;
      }

      context.respond(socket, 200, { status: 'ready' });
      logger.logWebRequest(method, path, 200);
      return true;
    }

    context.respond(socket, 405, { error: 'method_not_allowed' });
    logger.logWebRequest(method, path, 405);
    return true;
  };
}
