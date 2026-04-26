const { resolveErrorCode } = require('./apiEnvelope');

class ApiError extends Error {
  constructor(statusCode, message, errorCode = null, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode || ApiError.defaultCode(statusCode);
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static defaultCode(statusCode) {
    return resolveErrorCode(statusCode);
  }
}

module.exports = ApiError;
