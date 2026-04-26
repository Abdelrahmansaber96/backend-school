const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User.model');
const School = require('../models/School.model');
const ApiError = require('../utils/ApiError');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { hashPassword } = require('../utils/password');
const auditLogger = require('../utils/auditLogger');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_SHORT_MS = 15 * 60 * 1000; // 15 min
const LOCK_LONG_MS = 60 * 60 * 1000;  // 1 hr

const _hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Login with nationalId or phone
 */
const login = async ({ identifier, password, identifierType = 'nationalId' }, ipAddress, userAgent) => {
  const fieldMap = { nationalId: 'nationalId', phone: 'phone' };
  const field = fieldMap[identifierType] || 'nationalId';

  const user = await User.findOne({ [field]: identifier, isDeleted: { $ne: true } })
    .select('+password +refreshToken +failedLoginAttempts +lockedUntil +isActive');

  if (!user) throw new ApiError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');

  if (!user.isActive) throw new ApiError(403, 'Account is deactivated', 'ACCOUNT_INACTIVE');

  if (user.isLocked()) {
    throw new ApiError(423, `Account locked until ${user.lockedUntil.toISOString()}`, 'ACCOUNT_LOCKED');
  }

  const isValid = await user.comparePassword(password);

  if (!isValid) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= 10) {
      user.lockedUntil = new Date(Date.now() + LOCK_LONG_MS);
    } else if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCK_SHORT_MS);
    }
    await user.save({ validateBeforeSave: false });

    auditLogger.log({
      userId: user._id, schoolId: user.schoolId, action: 'login',
      entity: 'users', entityId: user._id,
      changes: { success: false, reason: 'invalid_password', attempts: user.failedLoginAttempts },
      ipAddress, userAgent,
    });

    throw new ApiError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  // Successful — reset lockout
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastLogin = new Date();

  const accessToken = generateAccessToken({
    _id: user._id, role: user.role, schoolId: user.schoolId, name: user.name,
  });
  const refreshToken = generateRefreshToken({ _id: user._id });
  user.refreshToken = _hashToken(refreshToken);
  await user.save({ validateBeforeSave: false });

  auditLogger.log({
    userId: user._id, schoolId: user.schoolId, action: 'login',
    entity: 'users', entityId: user._id, changes: { success: true },
    ipAddress, userAgent,
  });

  return {
    accessToken, refreshToken,
    user: {
      _id: user._id, role: user.role, schoolId: user.schoolId,
      name: user.name, mustChangePassword: user.mustChangePassword,
    },
  };
};

/**
 * Clear refresh token (logout)
 */
const logout = async (userId) => {
  await User.findByIdAndUpdate(userId, { refreshToken: null });
};

/**
 * Issue new token pair using refresh token (rotation)
 */
const refreshTokens = async (token) => {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, 'Refresh token is invalid or expired', 'TOKEN_EXPIRED');
  }

  const hashed = _hashToken(token);
  const user = await User.findOne({ _id: payload._id, refreshToken: hashed, isDeleted: { $ne: true }, isActive: true })
    .select('+refreshToken');

  if (!user) throw new ApiError(401, 'Refresh token has been revoked', 'TOKEN_REVOKED');

  const accessToken = generateAccessToken({
    _id: user._id, role: user.role, schoolId: user.schoolId, name: user.name,
  });
  const newRefreshToken = generateRefreshToken({ _id: user._id });
  user.refreshToken = _hashToken(newRefreshToken);
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken: newRefreshToken };
};

/**
 * Authenticated user changes their own password
 */
const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new ApiError(404, 'User not found');

  const isValid = await user.comparePassword(currentPassword);
  if (!isValid) throw new ApiError(400, 'Current password is incorrect', 'WRONG_PASSWORD');

  user.password = newPassword;
  user.mustChangePassword = false;
  await user.save();
};

/**
 * Admin-initiated temporary password reset
 */
const resetPassword = async (targetUserId, requesterRole, requesterSchoolId) => {
  const user = await User.findById(targetUserId);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  if (requesterRole === 'school_admin' && String(user.schoolId) !== String(requesterSchoolId)) {
    throw new ApiError(403, 'Cannot reset password of a user outside your school');
  }

  const tempPassword = crypto.randomBytes(4).toString('hex').toUpperCase() + '@1';
  user.password = tempPassword;
  user.mustChangePassword = true;
  await user.save();

  return tempPassword;
};

/**
 * Public school owner registration: creates school + admin user atomically.
 */
const registerSchool = async ({ schoolName, schoolNameAr, subdomain, address, phone, email, admin }) => {
  // Normalise subdomain
  const cleanSubdomain = subdomain.toLowerCase().trim();

  // Check uniqueness
  const existingSchool = await School.findOne({
    $or: [{ subdomain: cleanSubdomain }, { name: schoolName }],
    isDeleted: false,
  });
  if (existingSchool) {
    throw new ApiError(409, 'School name or subdomain already taken');
  }

  const existingUser = await User.findOne({
    $or: [{ nationalId: admin.nationalId }, ...(admin.phone ? [{ phone: admin.phone }] : [])],
    isDeleted: false,
  });
  if (existingUser) {
    throw new ApiError(409, 'Admin national ID or phone already in use');
  }

  const school = await School.create({
    name: schoolName,
    nameAr: schoolNameAr || null,
    subdomain: cleanSubdomain,
    address,
    phone,
    email: email || null,
    academicYear: '2025-2026',
  });

  try {
    const adminUser = await User.create({
      schoolId: school._id,
      role: 'school_admin',
      nationalId: admin.nationalId,
      phone: admin.phone,
      email: admin.email || null,
      password: admin.password,
      name: admin.name,
      mustChangePassword: false,
    });
    return { school, adminUser };
  } catch (err) {
    await School.deleteOne({ _id: school._id });
    throw err;
  }
};

module.exports = { login, logout, refreshTokens, changePassword, resetPassword, registerSchool };
