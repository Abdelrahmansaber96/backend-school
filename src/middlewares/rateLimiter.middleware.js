const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const { buildErrorResponse } = require('../utils/apiEnvelope');
const { verifyAccessToken } = require('../utils/jwt');

const resolveIpKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

const extractAccessToken = (req) => {
  const cookieToken = req.cookies?.accessToken;
  if (cookieToken) return cookieToken;

  const authorization = req.headers.authorization;
  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return authorization.slice(7).trim() || null;
};

const resolveAuthenticatedKey = (req) => {
  if (req.user?._id) {
    return `user:${req.user._id}`;
  }

  const token = extractAccessToken(req);
  if (!token) return null;

  try {
    const payload = verifyAccessToken(token);
    return payload?._id ? `user:${payload._id}` : null;
  } catch {
    return null;
  }
};

const createLimiter = (windowMs, max, message, { preferAuthenticatedUser = false } = {}) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    keyGenerator: (req) => {
      if (preferAuthenticatedUser) {
        return resolveAuthenticatedKey(req) || `ip:${resolveIpKey(req)}`;
      }

      return `ip:${resolveIpKey(req)}`;
    },
    message: buildErrorResponse({ statusCode: 429, code: 'RATE_LIMITED', message }),
  });

// Global: 100 req / 15 min per IP
const globalLimiter = createLimiter(
  config.RATE_LIMIT_WINDOW_MS,
  config.RATE_LIMIT_MAX,
  'Too many requests, please try again later.',
  { preferAuthenticatedUser: true },
);

// Auth endpoints: 10 req / 15 min per IP
const authLimiter = createLimiter(15 * 60 * 1000, 10, 'Too many authentication attempts.');

// Login: 10 failed attempts / 15 min per IP (successful logins don't count)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const identifier = String(req.body?.identifier || '').trim().toLowerCase();
    const ipKey = `ip:${resolveIpKey(req)}`;
    return identifier ? `${ipKey}:login:${identifier}` : `${ipKey}:login`;
  },
  message: buildErrorResponse({
    statusCode: 429,
    code: 'RATE_LIMITED',
    message: 'Too many login attempts. Please try again later.',
  }),
});

// Uploads: 50 req / hour per user
const uploadLimiter = createLimiter(60 * 60 * 1000, 50, 'Upload limit reached. Please try again later.', {
  preferAuthenticatedUser: true,
});

// Reports/exports: 10 req / hour per user
const reportLimiter = createLimiter(60 * 60 * 1000, 10, 'Report generation limit reached.', {
  preferAuthenticatedUser: true,
});

module.exports = { globalLimiter, authLimiter, loginLimiter, uploadLimiter, reportLimiter };
