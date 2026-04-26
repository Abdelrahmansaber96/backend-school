const ApiError = require('../utils/ApiError');

/**
 * Role-based access control middleware.
 * Usage: rbac('school_admin', 'teacher')
 */
const rbac = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }
    next();
  };
};

module.exports = rbac;
