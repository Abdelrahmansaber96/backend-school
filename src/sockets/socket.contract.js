const socketRooms = Object.freeze({
  user: (userId) => `user:${userId}`,
  school: (schoolId) => `school:${schoolId}`,
  conversation: (conversationId) => `conversation:${conversationId}`,
});

const SOCKET_EVENTS = Object.freeze({
  MESSAGE_CREATED: 'message.created',
  NOTIFICATION_CREATED: 'notification.created',
  ATTENDANCE_CREATED: 'attendance.created',
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  CONVERSATION_JOINED: 'conversation:joined',
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_READ: 'conversation:read',
  MESSAGE_TYPING: 'message:typing',
  MESSAGE_STOP_TYPING: 'message:stopTyping',
  NOTIFICATION_READ: 'notification:read',
  NOTIFICATION_READ_ALL: 'notification:readAll',
  NOTIFICATION_READ_ACK: 'notification:readAck',
  NOTIFICATION_READ_ALL_ACK: 'notification:readAllAck',
  SOCKET_ERROR: 'error',
});

const SOCKET_EVENT_ALIASES = Object.freeze({
  [SOCKET_EVENTS.MESSAGE_CREATED]: ['message:new'],
  [SOCKET_EVENTS.NOTIFICATION_CREATED]: ['notification:new'],
  [SOCKET_EVENTS.ATTENDANCE_CREATED]: ['attendance:recorded'],
});

const getSocketEventNames = (eventName) => [
  eventName,
  ...(SOCKET_EVENT_ALIASES[eventName] || []),
];

const resolveConversationId = (value) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && value.conversationId) {
    return value.conversationId;
  }
  return null;
};

module.exports = {
  socketRooms,
  SOCKET_EVENTS,
  SOCKET_EVENT_ALIASES,
  getSocketEventNames,
  resolveConversationId,
};