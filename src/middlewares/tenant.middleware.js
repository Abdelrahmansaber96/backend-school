const ApiError = require('../utils/ApiError');

/**
 * Injects req.schoolId from JWT for tenant-scoped queries.
 * Also considers subdomain-detected school (req.schoolIdFromSubdomain).
 * super_admin can optionally pass schoolId via query/params.
 */
const tenantMiddleware = (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));

  if (req.user.role !== 'super_admin') {
    if (!req.user.schoolId) {
      return next(new ApiError(403, 'Missing school context'));
    }
    req.schoolId = req.user.schoolId;

    // Cross-tenant check: if subdomain detected, ensure user belongs to that school
    if (req.schoolIdFromSubdomain && req.user.schoolId.toString() !== req.schoolIdFromSubdomain.toString()) {
      return next(new ApiError(403, 'Access denied: school context mismatch'));
    }
  } else {
    // super_admin: schoolId from query, params, or subdomain (optional — allows global view)
    req.schoolId = req.query.schoolId || req.params.schoolId || req.schoolIdFromSubdomain || null;
  }

  next();
};

module.exports = tenantMiddleware;
