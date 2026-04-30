const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const authService = require('../services/auth.service');
const config = require('../config/env');
const { verifyAccessToken } = require('../utils/jwt');

const parseDurationToMs = (value, fallback) => {
  if (typeof value === 'number') return value;
  const match = String(value).trim().match(/^(\d+)([smhd])$/i);
  if (!match) return fallback;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * multipliers[unit];
};

const resolveSameSite = () => {
  const envValue = String(process.env.COOKIE_SAME_SITE || '').trim().toLowerCase();

  if (['strict', 'lax', 'none'].includes(envValue)) {
    return envValue;
  }

  return config.NODE_ENV === 'production' ? 'none' : 'lax';
};

const COOKIE_BASE_OPTS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: resolveSameSite(),
  path: '/',
};

const ACCESS_COOKIE_OPTS = {
  ...COOKIE_BASE_OPTS,
  maxAge: parseDurationToMs(config.JWT_ACCESS_EXPIRY, 15 * 60 * 1000),
};

const REFRESH_COOKIE_OPTS = {
  ...COOKIE_BASE_OPTS,
  maxAge: parseDurationToMs(config.JWT_REFRESH_EXPIRY, 7 * 24 * 60 * 60 * 1000),
};

/**
 * POST /auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { identifier, password, identifierType } = req.body;
  const result = await authService.login(
    { identifier, password, identifierType },
    req.ip,
    req.get('user-agent'),
  );

  res.cookie('accessToken', result.accessToken, ACCESS_COOKIE_OPTS);
  res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTS);

  return res.status(200).json(
    new ApiResponse(200, { user: result.user }, 'Login successful'),
  );
});

/**
 * POST /auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  const accessToken = req.cookies.accessToken || req.headers.authorization?.split(' ')[1];

  if (req.user?._id) {
    await authService.logout(req.user._id);
  } else if (accessToken) {
    try {
      const payload = verifyAccessToken(accessToken);
      await authService.logout(payload._id);
    } catch {
      // Ignore invalid/expired access tokens during logout and clear cookies anyway.
    }
  }

  res.clearCookie('accessToken', COOKIE_BASE_OPTS);
  res.clearCookie('refreshToken', COOKIE_BASE_OPTS);
  return res.status(200).json(new ApiResponse(200, null, 'Logged out successfully'));
});

/**
 * POST /auth/refresh
 */
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken || req.body.refreshToken;
  if (!token) {
    throw new ApiError(401, 'Refresh token not provided');
  }

  const result = await authService.refreshTokens(token);
  res.cookie('accessToken', result.accessToken, ACCESS_COOKIE_OPTS);
  res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTS);

  return res.status(200).json(new ApiResponse(200, { refreshed: true }, 'Token refreshed'));
});

/**
 * PATCH /auth/change-password
 */
const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user._id, req.body);
  return res.status(200).json(new ApiResponse(200, null, 'Password changed successfully'));
});

/**
 * POST /auth/reset-password/:userId
 */
const resetPassword = asyncHandler(async (req, res) => {
  const tempPassword = await authService.resetPassword(
    req.params.userId,
    req.user.role,
    req.schoolId || req.user.schoolId || null,
  );
  return res.status(200).json(
    new ApiResponse(200, { tempPassword }, 'Password reset. User must change on next login.'),
  );
});

/**
 * POST /auth/register-school
 */
const registerSchool = asyncHandler(async (req, res) => {
  const result = await authService.registerSchool(req.body);
  return res.status(201).json(
    new ApiResponse(201, {
      school: {
        _id: result.school._id,
        name: result.school.name,
        subdomain: result.school.subdomain,
      },
    }, 'School registered successfully'),
  );
});

module.exports = { login, logout, refresh, changePassword, resetPassword, registerSchool };
