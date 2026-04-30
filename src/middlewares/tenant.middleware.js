const ApiError = require('../utils/ApiError');

/**
 * Injects req.schoolId from JWT for tenant-scoped queries.
 * super_admin can optionally pass schoolId via query/params.
 */
const tenantMiddleware = (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));

  if (req.user.role !== 'super_admin') {
    if (!req.user.schoolId) {
      return next(new ApiError(403, 'Missing school context'));
    }
    req.schoolId = req.user.schoolId;
  } else {
    req.schoolId = req.query.schoolId || req.params.schoolId || null;
  }

  next();
};

module.exports = tenantMiddleware;
