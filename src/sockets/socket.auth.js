const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User.model');

const parseCookies = (cookieHeader = '') => cookieHeader
  .split(';')
  .map((part) => part.trim())
  .filter(Boolean)
  .reduce((cookies, entry) => {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex === -1) return cookies;

    const key = entry.slice(0, separatorIndex).trim();
    const value = decodeURIComponent(entry.slice(separatorIndex + 1).trim());
    cookies[key] = value;
    return cookies;
  }, {});

/**
 * Socket.io authentication middleware
 * Verifies the Bearer token sent in socket handshake auth
 */
const socketAuth = async (socket, next) => {
  try {
    const cookies = parseCookies(socket.handshake.headers?.cookie);
    const token = cookies.accessToken
      || socket.handshake.auth?.token
      || socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET);

    const user = await User.findOne({
      _id: payload._id,
      isDeleted: false,
      isActive: true,
    }).select('_id role schoolId name');

    if (!user) return next(new Error('User not found or inactive'));

    // Attach user info to socket data
    socket.data.userId = user._id.toString();
    socket.data.schoolId = user.schoolId ? user.schoolId.toString() : null;
    socket.data.role = user.role;
    socket.data.name = user.name;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new Error('Token expired'));
    }
    next(new Error('Invalid token'));
  }
};

module.exports = socketAuth;
