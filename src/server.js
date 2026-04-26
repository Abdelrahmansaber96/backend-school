const http = require('http');
const app = require('./app');
const connectDB = require('./config/database');
const config = require('./config/env');
const logger = require('./utils/logger');
const { init: initSocketServer } = require('./sockets/socket.server');

const PORT = config.PORT;

const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Create HTTP server
    const httpServer = http.createServer(app);

    // 3. Initialize Socket.io
    initSocketServer(httpServer);
    logger.info('Socket.io initialized');

    // 4. Start listening
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Basma API server running on port ${PORT} [${config.NODE_ENV}]`);
      logger.info(`   Health: http://localhost:${PORT}/health`);
      logger.info(`   API:    http://localhost:${PORT}${config.API_PREFIX}`);
    });

    // 5. Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force-exit if still hanging after 10s
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

startServer();
