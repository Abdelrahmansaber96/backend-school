const { Server } = require('socket.io');
const config = require('../config/env');
const logger = require('../utils/logger');
const socketAuth = require('./socket.auth');
const messagingHandler = require('./handlers/messaging.handler');
const notificationHandler = require('./handlers/notification.handler');
const { socketRooms } = require('./socket.contract');

let io;

/**
 * Initialize Socket.io on the HTTP server
 */
const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: config.FRONTEND_URL,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authenticate every socket connection
  io.use(socketAuth);

  io.on('connection', (socket) => {
    const { userId, schoolId } = socket.data;
    logger.info(`Socket connected: userId=${userId} schoolId=${schoolId} socketId=${socket.id}`);

    // Join personal room for targeted notifications
    socket.join(socketRooms.user(userId));

    if (schoolId) {
      socket.join(socketRooms.school(schoolId));
    }

    // Register domain-specific handlers
    messagingHandler(io, socket);
    notificationHandler(io, socket);

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: userId=${userId} reason=${reason}`);
    });
  });

  return io;
};

/**
 * Get the initialized io instance (used by services to emit events)
 */
const getIo = () => {
  if (!io) throw new Error('Socket.io has not been initialized');
  return io;
};

module.exports = { init, getIo };
