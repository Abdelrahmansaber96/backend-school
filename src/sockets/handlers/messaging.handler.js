const Conversation = require('../../models/Conversation.model');
const messagingService = require('../../services/messaging.service');
const logger = require('../../utils/logger');
const { socketRooms, SOCKET_EVENTS, resolveConversationId } = require('../socket.contract');

/**
 * Handles real-time messaging events
 */
const messagingHandler = (io, socket) => {
  const userId = socket.data.userId;
  const schoolId = socket.data.schoolId;

  /**
   * Join a conversation room to receive messages
   */
  socket.on(SOCKET_EVENTS.CONVERSATION_JOIN, async (payload) => {
    const conversationId = resolveConversationId(payload);

    if (!conversationId) {
      return socket.emit(SOCKET_EVENTS.SOCKET_ERROR, { message: 'Conversation id is required' });
    }

    try {
      const convo = await Conversation.findOne({
        _id: conversationId,
        schoolId,
        participants: userId,
        isActive: true,
      });

      if (!convo) {
        return socket.emit(SOCKET_EVENTS.SOCKET_ERROR, { message: 'Conversation not found or access denied' });
      }

      socket.join(socketRooms.conversation(conversationId));
      socket.emit(SOCKET_EVENTS.CONVERSATION_JOINED, { conversationId });
    } catch (err) {
      logger.error(`[Socket] ${SOCKET_EVENTS.CONVERSATION_JOIN} error: ${err.message}`);
    }
  });

  /**
   * Leave a conversation room
   */
  socket.on(SOCKET_EVENTS.CONVERSATION_LEAVE, (payload) => {
    const conversationId = resolveConversationId(payload);
    if (!conversationId) return;

    socket.leave(socketRooms.conversation(conversationId));
  });

  /**
   * Typing indicator
   */
  socket.on(SOCKET_EVENTS.MESSAGE_TYPING, ({ conversationId } = {}) => {
    if (!conversationId) return;

    socket.to(socketRooms.conversation(conversationId)).emit(SOCKET_EVENTS.MESSAGE_TYPING, {
      userId,
      name: socket.data.name,
      conversationId,
    });
  });

  /**
   * Stop typing indicator
   */
  socket.on(SOCKET_EVENTS.MESSAGE_STOP_TYPING, ({ conversationId } = {}) => {
    if (!conversationId) return;

    socket.to(socketRooms.conversation(conversationId)).emit(SOCKET_EVENTS.MESSAGE_STOP_TYPING, {
      userId, conversationId,
    });
  });

  /**
   * Mark conversation as read (real-time)
   */
  socket.on(SOCKET_EVENTS.CONVERSATION_READ, async ({ conversationId } = {}) => {
    if (!conversationId) return;

    try {
      await messagingService.markConversationRead(conversationId, userId, schoolId);
      socket.to(socketRooms.conversation(conversationId)).emit(SOCKET_EVENTS.CONVERSATION_READ, { userId, conversationId });
    } catch (err) {
      logger.error(`[Socket] ${SOCKET_EVENTS.CONVERSATION_READ} error: ${err.message}`);
    }
  });
};

module.exports = messagingHandler;
