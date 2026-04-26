const Conversation = require('../models/Conversation.model');
const Message = require('../models/Message.model');
const Student = require('../models/Student.model');
const User = require('../models/User.model');
const ApiError = require('../utils/ApiError');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');
const { getParentScope, getTeacherScope } = require('../utils/accessScope');
const { assertRequesterRole } = require('../utils/authorization');
const { queueSocketEvent } = require('../sockets/socket.emitter');
const { socketRooms, SOCKET_EVENTS } = require('../sockets/socket.contract');

const MESSAGE_PARTICIPANT_ROLES = new Set(['teacher', 'parent', 'school_admin']);

const formatUserName = (user) => {
  const first = user?.name?.first;
  const last = user?.name?.last;
  return [first, last].filter(Boolean).join(' ').trim();
};

const hydrateConversation = (conversationId) =>
  Conversation.findById(conversationId).populate('participants', 'name avatar role');

const hydrateMessage = (messageId) =>
  Message.findById(messageId).populate('senderId', 'name avatar role');

const resolveConversationType = (firstRole, secondRole) => {
  const roles = new Set([firstRole, secondRole]);

  if (roles.has('teacher') && roles.has('parent') && roles.size === 2) {
    return 'teacher_parent';
  }

  if (roles.has('school_admin') && roles.has('parent') && roles.size === 2) {
    return 'admin_parent';
  }

  if (roles.has('school_admin') && roles.has('teacher') && roles.size === 2) {
    return 'admin_teacher';
  }

  return null;
};

const linkUploadedFiles = async (attachments, schoolId, contextId) => {
  const fileIds = (attachments || [])
    .map((attachment) => attachment?.publicId)
    .filter(Boolean);

  if (!fileIds.length) return;

  const uploadService = require('./upload.service');
  await Promise.allSettled(
    fileIds.map((publicId) => uploadService.linkFile(publicId, contextId, schoolId)),
  );
};

const ensureTeacherParentConversationAccess = async (teacherUserId, parentUserId, schoolId) => {
  const [teacherScope, parentScope] = await Promise.all([
    getTeacherScope(teacherUserId, schoolId),
    getParentScope(parentUserId, schoolId),
  ]);

  if (!teacherScope.classIds.length || !parentScope.childIds.length) {
    throw new ApiError(403, 'Conversation is not allowed for these users');
  }

  const children = await Student.find({ _id: { $in: parentScope.childIds }, schoolId, isDeleted: false })
    .select('classId')
    .lean();

  const hasSharedClass = children.some((child) => teacherScope.classIds.includes(String(child.classId)));
  if (!hasSharedClass) {
    throw new ApiError(403, 'Parents can only message teachers of their children');
  }
};

const ensureConversationRelationship = async (currentUser, participant, schoolId) => {
  const conversationType = resolveConversationType(currentUser.role, participant.role);
  if (!conversationType) {
    throw new ApiError(403, 'Conversations are only allowed between teachers, parents, and school admins');
  }

  if (conversationType === 'teacher_parent') {
    const teacherUserId = currentUser.role === 'teacher' ? currentUser._id : participant._id;
    const parentUserId = currentUser.role === 'parent' ? currentUser._id : participant._id;
    await ensureTeacherParentConversationAccess(teacherUserId, parentUserId, schoolId);
  }

  return conversationType;
};

/**
 * Get or create a conversation between two users
 */
const getOrCreateConversation = async (userId, participantId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'teacher', 'parent']);

  if (String(userId) === String(participantId)) {
    throw new ApiError(400, 'You cannot create a conversation with yourself');
  }

  const [currentUser, participant] = await Promise.all([
    User.findOne({ _id: userId, schoolId, isDeleted: false, isActive: true }).select('role _id'),
    User.findOne({ _id: participantId, schoolId, isDeleted: false, isActive: true }).select('role _id'),
  ]);

  if (!currentUser) throw new ApiError(404, 'Current user not found in this school');
  if (!participant) throw new ApiError(404, 'Participant not found in this school');

  if (!MESSAGE_PARTICIPANT_ROLES.has(currentUser.role) || !MESSAGE_PARTICIPANT_ROLES.has(participant.role)) {
    throw new ApiError(403, 'Messaging is not allowed for these user roles');
  }

  const conversationType = await ensureConversationRelationship(currentUser, participant, schoolId);

  const existingConvo = await Conversation.findOne({
    schoolId,
    participants: { $all: [userId, participantId] },
    isActive: true,
  });
  if (existingConvo) {
    return hydrateConversation(existingConvo._id);
  }

  const convo = await Conversation.create({
    schoolId,
    participants: [userId, participantId],
    type: conversationType,
    unreadCount: { [userId.toString()]: 0, [participantId.toString()]: 0 },
  });

  return hydrateConversation(convo._id);
};

/**
 * List conversations for a user
 */
const listConversations = async (userId, schoolId, query, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'teacher', 'parent']);

  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['updatedAt', 'createdAt'], 'updatedAt');

  const filter = { schoolId, participants: userId, isActive: true };
  const [conversations, total] = await Promise.all([
    Conversation.find(filter)
      .populate('participants', 'name avatar role')
      .skip(skip).limit(limit).sort(sort),
    Conversation.countDocuments(filter),
  ]);

  return {
    data: conversations,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['updatedAt', 'createdAt'],
      defaultSortField: 'updatedAt',
    }),
  };
};

/**
 * Get messages in a conversation (paginated, oldest first)
 */
const getMessages = async (conversationId, userId, schoolId, query, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'teacher', 'parent']);

  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['createdAt'], 'createdAt', 'asc');

  const convo = await Conversation.findOne({ _id: conversationId, schoolId, participants: userId });
  if (!convo) throw new ApiError(404, 'Conversation not found');

  const [messages, total] = await Promise.all([
    Message.find({ conversationId, isDeleted: false })
      .populate('senderId', 'name avatar role')
      .skip(skip).limit(limit).sort(sort),
    Message.countDocuments({ conversationId, isDeleted: false }),
  ]);

  // Mark all messages as read for this user
  await markConversationRead(conversationId, userId, schoolId, requester);

  return {
    data: messages,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt'],
      defaultSortField: 'createdAt',
      defaultSortOrder: 'asc',
    }),
  };
};

/**
 * Send a message in a conversation
 */
const sendMessage = async (conversationId, senderId, { text, attachments }, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'teacher', 'parent']);

  const convo = await Conversation.findOne({ _id: conversationId, schoolId, participants: senderId, isActive: true });
  if (!convo) throw new ApiError(404, 'Conversation not found');

  const message = await Message.create({
    schoolId, conversationId, senderId, text, attachments,
    readBy: [senderId],
  });

  await linkUploadedFiles(attachments, schoolId, message._id);

  const populatedMessage = await hydrateMessage(message._id);

  // Update conversation last message and unread counts
  const otherParticipants = convo.participants.filter((p) => String(p) !== String(senderId));
  const unreadCountUpdate = {};
  otherParticipants.forEach((p) => {
    const key = `unreadCount.${p}`;
    unreadCountUpdate[key] = (convo.unreadCount.get(String(p)) || 0) + 1;
  });

  await Conversation.findByIdAndUpdate(conversationId, {
    $set: {
      lastMessage: { text: text || '📎 Attachment', senderId, sentAt: new Date() },
      ...unreadCountUpdate,
      updatedAt: new Date(),
    },
  });

  // Emit via socket
  queueSocketEvent({
    room: socketRooms.conversation(conversationId),
    eventName: SOCKET_EVENTS.MESSAGE_CREATED,
    payload: populatedMessage,
  });

  otherParticipants.forEach((pid) => {
    queueSocketEvent({
      room: socketRooms.user(pid),
      eventName: SOCKET_EVENTS.CONVERSATION_UPDATED,
      payload: {
        conversationId, lastMessage: populatedMessage,
      },
    });
  });

  const senderName = formatUserName(populatedMessage.senderId);
  const previewText = String(text || 'Attachment received').trim().slice(0, 100);
  const notificationService = require('./notification.service');

  await Promise.allSettled(otherParticipants.map((recipientId) => notificationService.createNotification({
    schoolId,
    userId: recipientId,
    type: 'message',
    title: senderName ? `New Message from ${senderName}` : 'New Message',
    body: previewText,
    data: {
      entityType: 'messages',
      entityId: message._id,
      extra: {
        conversationId,
        senderId: String(senderId),
      },
    },
    deliveryMethod: ['in_app'],
  })));

  return populatedMessage;
};

/**
 * Mark all messages in a conversation as read for a user
 */
const markConversationRead = async (conversationId, userId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'teacher', 'parent']);

  const convo = await Conversation.findOne({ _id: conversationId, schoolId, participants: userId, isActive: true }).select('_id');
  if (!convo) throw new ApiError(404, 'Conversation not found');

  await Message.updateMany(
    { conversationId, readBy: { $ne: userId }, isDeleted: false },
    { $addToSet: { readBy: userId } },
  );

  await Conversation.findOneAndUpdate({ _id: conversationId, schoolId }, {
    $set: { [`unreadCount.${userId}`]: 0 },
  });
};

module.exports = {
  getOrCreateConversation, listConversations, getMessages, sendMessage, markConversationRead,
};
