const { buildSuccessResponse, buildErrorResponse, resolveErrorCode } = require('./apiEnvelope');

class ApiResponse {
  constructor(statusCode, data, legacyMessage = null, pagination = null) {
    if (statusCode >= 400) {
      Object.assign(this, buildErrorResponse({
        statusCode,
        code: resolveErrorCode(statusCode),
        message: typeof legacyMessage === 'string' && legacyMessage ? legacyMessage : 'Request failed',
      }));
      return;
    }

    Object.assign(this, buildSuccessResponse(data, pagination));
  }
}

module.exports = ApiResponse;
