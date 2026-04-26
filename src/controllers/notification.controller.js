const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const notificationService = require('../services/notification.service');

const listNotifications = asyncHandler(async (req, res) => {
  const result = await notificationService.listNotifications(req.user._id, req.query);
  return res.status(200).json(new ApiResponse(200, result.data, 'Notifications fetched', result.meta));
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.params.id, req.user._id);
  return res.status(200).json(new ApiResponse(200, notification, 'Notification marked as read'));
});

const markAllRead = asyncHandler(async (req, res) => {
  const count = await notificationService.markAllRead(req.user._id);
  return res.status(200).json(new ApiResponse(200, { count }, `${count} notifications marked as read`));
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user._id);
  return res.status(200).json(new ApiResponse(200, { count }, 'Unread count fetched'));
});

module.exports = { listNotifications, markRead, markAllRead, getUnreadCount };
