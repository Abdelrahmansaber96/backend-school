const notificationService = require('../../services/notification.service');
const logger = require('../../utils/logger');
const { SOCKET_EVENTS } = require('../socket.contract');

/**
 * Handles real-time notification events
 */
const notificationHandler = (io, socket) => {
  const userId = socket.data.userId;

  /**
   * Mark a notification as read in real time
   */
  socket.on(SOCKET_EVENTS.NOTIFICATION_READ, async ({ notificationId } = {}) => {
    if (!notificationId) return;

    try {
      await notificationService.markRead(notificationId, userId);
      socket.emit(SOCKET_EVENTS.NOTIFICATION_READ_ACK, { notificationId });
    } catch (err) {
      logger.error(`[Socket] ${SOCKET_EVENTS.NOTIFICATION_READ} error: ${err.message}`);
    }
  });

  /**
   * Mark all notifications as read
   */
  socket.on(SOCKET_EVENTS.NOTIFICATION_READ_ALL, async () => {
    try {
      const count = await notificationService.markAllRead(userId);
      socket.emit(SOCKET_EVENTS.NOTIFICATION_READ_ALL_ACK, { count });
    } catch (err) {
      logger.error(`[Socket] ${SOCKET_EVENTS.NOTIFICATION_READ_ALL} error: ${err.message}`);
    }
  });
};

module.exports = notificationHandler;
