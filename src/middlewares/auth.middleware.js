const { verifyAccessToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User.model');

const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const headerToken = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;
  const token = req.cookies?.accessToken || headerToken;

  if (!token) {
    throw new ApiError(401, 'Access token required');
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    throw new ApiError(401, 'Invalid or expired access token');
  }

  // Verify user still active in DB (lightweight check)
  const user = await User.findById(decoded._id).select('isActive isDeleted role schoolId name');
  if (!user || user.isDeleted || !user.isActive) {
    throw new ApiError(401, 'User account is inactive or deleted');
  }

  req.user = {
    _id: user._id,
    role: user.role,
    schoolId: user.schoolId,
    name: user.name,
  };

  next();
});

module.exports = authenticate;
