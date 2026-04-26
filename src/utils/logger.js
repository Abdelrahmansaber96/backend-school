const winston = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack, requestId, userId }) => {
  const reqId = requestId ? ` [${requestId}]` : '';
  const uid = userId ? ` [user:${userId}]` : '';
  const msg = stack || message;
  return `${ts}${reqId}${uid} [${level}]: ${msg}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat,
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), errors({ stack: true }), timestamp({ format: 'HH:mm:ss' }), logFormat),
    }),
  ],
});

if (process.env.NODE_ENV === 'production') {
  try {
    const DailyRotateFile = require('winston-daily-rotate-file');
    logger.add(
      new DailyRotateFile({
        filename: path.join('logs', 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxFiles: '14d',
      }),
    );
    logger.add(
      new DailyRotateFile({
        filename: path.join('logs', 'combined-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
      }),
    );
  } catch {
    // winston-daily-rotate-file optional in dev
  }
}

module.exports = logger;
