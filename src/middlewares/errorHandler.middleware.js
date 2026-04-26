const logger = require('../utils/logger');
const { buildErrorResponse } = require('../utils/apiEnvelope');

const sendError = (res, statusCode, message, code, details = []) =>
  res.status(statusCode).json(buildErrorResponse({
    statusCode,
    code,
    message,
    details,
  }));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    requestId: req.id,
    userId: req.user?._id,
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return sendError(res, 400, 'Validation failed', 'VALIDATION_ERROR', details);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return sendError(res, 409, `${field} already exists`, 'CONFLICT', [{
      field,
      message: `${field} already exists`,
    }]);
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return sendError(res, 400, 'Invalid ID format', 'BAD_REQUEST');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return sendError(res, 401, 'Invalid or expired token', 'UNAUTHORIZED');
  }

  // Operational (known) errors
  if (err.isOperational) {
    return sendError(res, err.statusCode, err.message, err.errorCode, err.errors || []);
  }

  // Unknown programming errors — hide details in production
  const message =
    process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message;

  return sendError(res, 500, message, 'INTERNAL_ERROR');
};

module.exports = errorHandler;
