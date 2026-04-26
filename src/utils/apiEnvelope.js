const ERROR_CODE_BY_STATUS = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  423: 'ACCOUNT_LOCKED',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

const resolveErrorCode = (statusCode, fallback = 'INTERNAL_ERROR') =>
  ERROR_CODE_BY_STATUS[statusCode] || fallback;

const buildSuccessResponse = (data, pagination = null) => {
  if (!pagination) {
    return {
      success: true,
      data,
    };
  }

  return {
    success: true,
    data: {
      items: data,
      pagination,
    },
  };
};

const buildErrorResponse = ({ statusCode = 500, code, message, details }) => {
  const response = {
    success: false,
    data: null,
    error: {
      code: code || resolveErrorCode(statusCode),
      message,
    },
  };

  if (Array.isArray(details) && details.length) {
    response.error.details = details;
  }

  return response;
};

module.exports = {
  buildSuccessResponse,
  buildErrorResponse,
  resolveErrorCode,
};