const jwt = require('jsonwebtoken');
const config = require('../config/env');

const generateAccessToken = (payload) =>
  jwt.sign(payload, config.JWT_ACCESS_SECRET, { expiresIn: config.JWT_ACCESS_EXPIRY });

const generateRefreshToken = (payload) =>
  jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: config.JWT_REFRESH_EXPIRY });

const verifyAccessToken = (token) => jwt.verify(token, config.JWT_ACCESS_SECRET);

const verifyRefreshToken = (token) => jwt.verify(token, config.JWT_REFRESH_SECRET);

module.exports = { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken };
