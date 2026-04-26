const Notification = require('../models/Notification.model');
const Parent = require('../models/Parent.model');
const User = require('../models/User.model');
const ApiError = require('../utils/ApiError');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');
const { queueSocketEvent } = require('../sockets/socket.emitter');
const { socketRooms, SOCKET_EVENTS } = require('../sockets/socket.contract');
const { sendMockEmail } = require('./mockEmail.service');
const logger = require('../utils/logger');

const queueNotificationEvent = (userId, eventName, payload) => {
  queueSocketEvent({
    room: socketRooms.user(userId),
    eventName,
    payload,
  });
};

/**
 * Create and push a notification (also emits via socket)
 */
const createNotification = async ({
  schoolId, userId, parentId, type, title, body, data, deliveryMethod,
}) => {
  let targetUserId = userId;

  // If parentId is provided (e.g., from behavior service), resolve the User id
  if (!targetUserId && parentId) {
    const parent = await Parent.findOne({ _id: parentId, schoolId, isDeleted: false }).select('userId');
    if (parent) targetUserId = parent.userId;
  }

  if (!targetUserId) return null;

  const targetUser = await User.findById(targetUserId).select('email name');

  const notification = await Notification.create({
    schoolId, userId: targetUserId, type, title, body,
    data: data || {}, deliveryMethod: deliveryMethod || ['in_app'],
  });

  queueNotificationEvent(targetUserId, SOCKET_EVENTS.NOTIFICATION_CREATED, notification);

  if (notification.deliveryMethod.includes('email') && targetUser?.email) {
    try {
      await sendMockEmail({
        to: targetUser.email,
        subject: title,
        text: `${body}\n\nNotification type: ${type}`,
        metadata: {
          notificationId: String(notification._id),
          userId: String(targetUserId),
          type,
        },
      });

      notification.emailSent = true;
      await notification.save({ validateBeforeSave: false });
    } catch (error) {
      logger.error(`Mock email delivery failed for notification ${notification._id}: ${error.message}`);
    }
  }

  return notification;
};

/**
 * Get notifications for the current user
 */
const listNotifications = async (userId, query) => {
  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['createdAt', 'type', 'isRead']);
  const filter = { userId };

  if (query.isRead !== undefined) filter.isRead = query.isRead === 'true';
  if (query.type) filter.type = query.type;

  const [notifications, total, unread] = await Promise.all([
    Notification.find(filter).skip(skip).limit(limit).sort(sort),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, isRead: false }),
  ]);

  return {
    data: notifications,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt', 'type', 'isRead'],
      extra: { unread },
    }),
  };
};

/**
 * Mark a single notification as read
 */
const markRead = async (notificationId, userId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true },
  );
  if (!notification) throw new ApiError(404, 'Notification not found');

  queueNotificationEvent(userId, SOCKET_EVENTS.NOTIFICATION_READ, { notificationId: String(notification._id) });
  return notification;
};

/**
 * Mark all notifications as read for a user
 */
const markAllRead = async (userId) => {
  const result = await Notification.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );

  queueNotificationEvent(userId, SOCKET_EVENTS.NOTIFICATION_READ_ALL, { count: result.modifiedCount });
  return result.modifiedCount;
};

/**
 * Get unread count for a user
 */
const getUnreadCount = async (userId) => {
  return Notification.countDocuments({ userId, isRead: false });
};

module.exports = { createNotification, listNotifications, markRead, markAllRead, getUnreadCount };
