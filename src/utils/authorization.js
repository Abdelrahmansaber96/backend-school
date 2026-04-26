const ApiError = require('./ApiError');

const assertRequesterRole = (requester = {}, allowedRoles, message = 'Forbidden') => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  if (!requester.role || !roles.includes(requester.role)) {
    throw new ApiError(403, message);
  }
};

module.exports = { assertRequesterRole };