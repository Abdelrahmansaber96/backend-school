const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const messagingService = require('../services/messaging.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
});

const listConversations = asyncHandler(async (req, res) => {
  const result = await messagingService.listConversations(req.user._id, req.schoolId, req.query, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result.data, 'Conversations fetched', result.meta));
});

const getOrCreateConversation = asyncHandler(async (req, res) => {
  const convo = await messagingService.getOrCreateConversation(
    req.user._id, req.body.participantId, req.schoolId, getRequesterContext(req),
  );
  return res.status(200).json(new ApiResponse(200, convo, 'Conversation ready'));
});

const getMessages = asyncHandler(async (req, res) => {
  const result = await messagingService.getMessages(
    req.params.id, req.user._id, req.schoolId, req.query, getRequesterContext(req),
  );
  return res.status(200).json(new ApiResponse(200, result.data, 'Messages fetched', result.meta));
});

const sendMessage = asyncHandler(async (req, res) => {
  const message = await messagingService.sendMessage(
    req.params.id, req.user._id, req.body, req.schoolId, getRequesterContext(req),
  );
  return res.status(201).json(new ApiResponse(201, message, 'Message sent'));
});

const markRead = asyncHandler(async (req, res) => {
  await messagingService.markConversationRead(req.params.id, req.user._id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, null, 'Conversation marked as read'));
});

module.exports = { listConversations, getOrCreateConversation, getMessages, sendMessage, markRead };
