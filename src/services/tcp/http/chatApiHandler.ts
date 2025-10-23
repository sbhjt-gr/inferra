import chatManager, { type Chat } from '../../../utils/ChatManager';
import { logger } from '../../../utils/logger';
import type { ApiHandler, JsonResponder } from './apiTypes';

type Context = {
  respond: JsonResponder;
};

type SerializableChat = {
  id: string;
  title: string;
  timestamp: number;
  modelPath: string | null;
  messageCount: number;
  messages?: Chat['messages'];
};

function serializeChat(chat: Chat, includeMessages: boolean): SerializableChat {
  return {
    id: chat.id,
    title: chat.title,
    timestamp: chat.timestamp,
    modelPath: chat.modelPath ?? null,
    messageCount: chat.messages.length,
    ...(includeMessages ? { messages: chat.messages } : {}),
  };
}

export function createChatApiHandler(context: Context): ApiHandler {
  return async (method, segments, body, socket, path) => {
    if (segments.length === 0) {
      if (method === 'GET') {
        try {
          await chatManager.ensureInitialized();
          const chats = chatManager.getAllChats();
          context.respond(socket, 200, { chats: chats.map((chat: Chat) => serializeChat(chat, false)) });
          logger.logWebRequest(method, `/api/chats`, 200);
        } catch (error) {
          context.respond(socket, 500, { error: 'chat_list_failed' });
          logger.logWebRequest(method, `/api/chats`, 500);
        }
        return true;
      }

      if (method === 'POST') {
        if (!body) {
          context.respond(socket, 400, { error: 'empty_body' });
          logger.logWebRequest(method, `/api/chats`, 400);
          return true;
        }

        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch (error) {
          context.respond(socket, 400, { error: 'invalid_json' });
          logger.logWebRequest(method, `/api/chats`, 400);
          return true;
        }

        const title = typeof payload?.title === 'string' && payload.title.length > 0 ? payload.title : undefined;
        const initialMessages = Array.isArray(payload?.messages) ? payload.messages : [];
        const preparedMessages = initialMessages
          .filter((entry: any) => entry && typeof entry.content === 'string')
          .map((entry: any) => ({
            id: typeof entry.id === 'string' ? entry.id : undefined,
            role: typeof entry.role === 'string' ? entry.role : 'user',
            content: entry.content,
            thinking: typeof entry.thinking === 'string' ? entry.thinking : undefined,
            stats: typeof entry.stats === 'object' ? entry.stats : undefined,
          }));

        try {
          await chatManager.ensureInitialized();
          const chat = await chatManager.createNewChat();
          if (preparedMessages.length > 0) {
            await chatManager.appendMessages(chat.id, preparedMessages);
          }
          const updated = chatManager.getChatById(chat.id) || chat;
          if (title) {
            await chatManager.setChatTitle(chat.id, title);
          }
          context.respond(socket, 201, { chat: serializeChat(updated, true) });
          logger.logWebRequest(method, `/api/chats`, 201);
        } catch (error) {
          context.respond(socket, 500, { error: 'chat_create_failed' });
          logger.logWebRequest(method, `/api/chats`, 500);
        }
        return true;
      }

      context.respond(socket, 405, { error: 'method_not_allowed' });
      logger.logWebRequest(method, `/api/chats`, 405);
      return true;
    }

    const chatId = segments[0];
    const subresource = segments[1] || '';

    if (method === 'GET' && !subresource) {
      try {
        await chatManager.ensureInitialized();
        const chat = chatManager.getChatById(chatId);
        if (!chat) {
          context.respond(socket, 404, { error: 'chat_not_found' });
          logger.logWebRequest(method, path, 404);
          return true;
        }

        context.respond(socket, 200, { chat: serializeChat(chat, true) });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        context.respond(socket, 500, { error: 'chat_load_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    if (method === 'DELETE' && !subresource) {
      try {
        await chatManager.ensureInitialized();
        const result = await chatManager.deleteChat(chatId);
        if (!result) {
          context.respond(socket, 404, { error: 'chat_not_found' });
          logger.logWebRequest(method, path, 404);
          return true;
        }

        context.respond(socket, 200, { status: 'deleted', chatId });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        context.respond(socket, 500, { error: 'chat_delete_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    if (subresource === 'messages') {
      if (method === 'GET') {
        try {
          await chatManager.ensureInitialized();
          const chat = chatManager.getChatById(chatId);
          if (!chat) {
            context.respond(socket, 404, { error: 'chat_not_found' });
            logger.logWebRequest(method, path, 404);
            return true;
          }

          context.respond(socket, 200, { messages: chat.messages });
          logger.logWebRequest(method, path, 200);
        } catch (error) {
          context.respond(socket, 500, { error: 'chat_messages_failed' });
          logger.logWebRequest(method, path, 500);
        }
        return true;
      }

      if (method === 'POST') {
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

        const entries = Array.isArray(payload?.messages) ? payload.messages : Array.isArray(payload) ? payload : [payload];

        try {
          const created = await chatManager.appendMessages(
            chatId,
            entries.map((item: any) => ({
              id: typeof item?.id === 'string' ? item.id : undefined,
              role: typeof item?.role === 'string' ? item.role : 'user',
              content: typeof item?.content === 'string' ? item.content : '',
              thinking: typeof item?.thinking === 'string' ? item.thinking : undefined,
              stats: typeof item?.stats === 'object' ? item.stats : undefined,
            }))
          );

          context.respond(socket, 201, { messages: created });
          logger.logWebRequest(method, path, 201);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'chat_message_append_failed';
          if (message === 'chat_not_found') {
            context.respond(socket, 404, { error: 'chat_not_found' });
            logger.logWebRequest(method, path, 404);
          } else {
            context.respond(socket, 500, { error: 'chat_message_append_failed' });
            logger.logWebRequest(method, path, 500);
          }
        }
        return true;
      }

      if (segments.length >= 3) {
        const messageId = segments[2];

        if (method === 'PUT') {
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

          const updates = typeof payload === 'object' && payload ? payload : {};

          const result = await chatManager.updateMessageById(chatId, messageId, {
            content: typeof updates.content === 'string' ? updates.content : undefined,
            thinking: typeof updates.thinking === 'string' ? updates.thinking : updates.thinking === null ? null : undefined,
            stats: typeof updates.stats === 'object' ? updates.stats : updates.stats === null ? null : undefined,
            role: typeof updates.role === 'string' ? updates.role : undefined,
          });

          if (!result) {
            context.respond(socket, 404, { error: 'message_not_found' });
            logger.logWebRequest(method, path, 404);
            return true;
          }

          context.respond(socket, 200, { status: 'updated', chatId, messageId });
          logger.logWebRequest(method, path, 200);
          return true;
        }

        if (method === 'DELETE') {
          try {
            const result = await chatManager.removeMessage(chatId, messageId);
            if (!result) {
              context.respond(socket, 404, { error: 'message_not_found' });
              logger.logWebRequest(method, path, 404);
              return true;
            }

            context.respond(socket, 200, { status: 'deleted', chatId, messageId });
            logger.logWebRequest(method, path, 200);
          } catch (error) {
            context.respond(socket, 500, { error: 'message_delete_failed' });
            logger.logWebRequest(method, path, 500);
          }
          return true;
        }
      }
    }

    if (subresource === 'title' && method === 'POST') {
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

      const title = typeof payload?.title === 'string' && payload.title.length > 0 ? payload.title : undefined;
      const prompt = typeof payload?.prompt === 'string' && payload.prompt.length > 0 ? payload.prompt : undefined;

      try {
        await chatManager.ensureInitialized();
        const chat = chatManager.getChatById(chatId);
        if (!chat) {
          context.respond(socket, 404, { error: 'chat_not_found' });
          logger.logWebRequest(method, path, 404);
          return true;
        }

        if (title) {
          await chatManager.setChatTitle(chatId, title);
          context.respond(socket, 200, { title, generated: false });
          logger.logWebRequest(method, path, 200);
          return true;
        }

        const generated = await chatManager.generateTitleForChat(chatId, prompt);
        if (!generated) {
          context.respond(socket, 422, { error: 'title_generation_failed' });
          logger.logWebRequest(method, path, 422);
          return true;
        }

        context.respond(socket, 200, { title: generated, generated: true });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        context.respond(socket, 500, { error: 'title_update_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    if (subresource === 'model' && method === 'POST') {
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

      const modelPath = typeof payload?.path === 'string' && payload.path.length > 0 ? payload.path : null;

      try {
        const updated = await chatManager.setChatModelPath(chatId, modelPath);
        if (!updated) {
          context.respond(socket, 404, { error: 'chat_not_found' });
          logger.logWebRequest(method, path, 404);
          return true;
        }

        context.respond(socket, 200, { status: 'updated', chatId, modelPath });
        logger.logWebRequest(method, path, 200);
      } catch (error) {
        context.respond(socket, 500, { error: 'chat_model_update_failed' });
        logger.logWebRequest(method, path, 500);
      }
      return true;
    }

    return false;
  };
}
