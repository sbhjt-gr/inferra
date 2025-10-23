import { logger } from '../../../utils/logger';

type SignalingContext = {
  respond: (socket: any, status: number, payload: any) => void;
  sendOffer: (offer: any) => void;
};

export function createOfferHandler(context: SignalingContext) {
  return async (method: string, path: string, body: string, socket: any): Promise<boolean> => {
    if (method !== 'POST' || path !== '/offer') {
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

    if (!payload.offer) {
      context.respond(socket, 400, { error: 'missing_offer' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    try {
      context.sendOffer(payload.offer);
      context.respond(socket, 200, { status: 'offer_received' });
      logger.logWebRequest(method, path, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'offer_failed';
      logger.error(`webrtc_offer_failed:${message.replace(/\s+/g, '_')}`, 'webrtc');
      context.respond(socket, 500, { error: 'offer_failed' });
      logger.logWebRequest(method, path, 500);
    }
    return true;
  };
}

export function createAnswerHandler(context: SignalingContext) {
  return async (method: string, path: string, body: string, socket: any): Promise<boolean> => {
    if (method !== 'POST' || path !== '/webrtc/answer') {
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

    if (!payload.answer) {
      context.respond(socket, 400, { error: 'missing_answer' });
      logger.logWebRequest(method, path, 400);
      return true;
    }

    try {
      // Answer handling would be delegated to WebRTC manager
      context.respond(socket, 200, { status: 'answer_received' });
      logger.logWebRequest(method, path, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'answer_failed';
      logger.error(`webrtc_answer_failed:${message.replace(/\s+/g, '_')}`, 'webrtc');
      context.respond(socket, 500, { error: 'answer_failed' });
      logger.logWebRequest(method, path, 500);
    }
    return true;
  };
}
