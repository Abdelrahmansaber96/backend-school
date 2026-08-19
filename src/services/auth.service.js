const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User.model');
const School = require('../models/School.model');
const PasswordResetToken = require('../models/PasswordResetToken.model');
const ApiError = require('../utils/ApiError');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const auditLogger = require('../utils/auditLogger');
const { getCurrentHijriAcademicYear } = require('../utils/academicYear');
const registrationInviteService = require('./registrationInvite.service');
const { sendMockEmail } = require('./mockEmail.service');
const config = require('../config/env');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_SHORT_MS = 15 * 60 * 1000; // 15 min
const LOCK_LONG_MS = 60 * 60 * 1000;  // 1 hr

const _hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const TOKEN_TTL_MS = 15 * 60 * 1000;
const createOneTimeToken = async (userId, purpose) => {
  const token = crypto.randomBytes(32).toString('hex');
  await PasswordResetToken.deleteMany({ userId, purpose, usedAt: null });
  await PasswordResetToken.create({ userId, purpose, tokenHash: _hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) });
  return token;
};

const sendEmailVerification = async (user) => {
  const verificationToken = await createOneTimeToken(user._id, 'email_verification');
  const verificationUrl = `${config.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  await sendMockEmail({
    to: user.email,
    subject: 'تأكيد بريد مدير المدرسة - منصة بصمة',
    text: `مرحبًا ${user.name.first}،\nيرجى تأكيد بريدك من الرابط التالي خلال 15 دقيقة:\n${verificationUrl}`,
  });
};

const normalizeSubdomainCandidate = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 63)
  .replace(/-+$/g, '');

const buildInternalSchoolSubdomain = async (schoolName, preferredSubdomain) => {
  const preferredBase = normalizeSubdomainCandidate(preferredSubdomain);
  const nameBase = normalizeSubdomainCandidate(schoolName);
  const fallbackBase = `school-${crypto.randomBytes(3).toString('hex')}`;
  const base = preferredBase || nameBase || fallbackBase;

  let candidate = base;
  let suffix = 1;

  while (await School.exists({ subdomain: candidate, isDeleted: false })) {
    const nextSuffix = `-${suffix}`;
    const trimmedBase = base.slice(0, Math.max(1, 63 - nextSuffix.length)).replace(/-+$/g, '');
    candidate = `${trimmedBase}${nextSuffix}`;
    suffix += 1;
  }

  return candidate;
};

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

  if (user.schoolId && user.role !== 'super_admin') {
    const school = await School.findById(user.schoolId).select('status isActive isDeleted');
    if (!school || school.isDeleted || school.isActive === false || school.status === 'suspended') {
      throw new ApiError(403, 'المدرسة موقوفة مؤقتًا. يرجى التواصل مع إدارة المنصة.', 'SCHOOL_SUSPENDED');
    }
  }

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

  if (user.schoolId && user.role !== 'super_admin') {
    const school = await School.findById(user.schoolId).select('status isActive isDeleted');
    if (!school || school.isDeleted || school.isActive === false || school.status === 'suspended') {
      user.refreshToken = null;
      await user.save({ validateBeforeSave: false });
      throw new ApiError(403, 'المدرسة موقوفة مؤقتًا. يرجى التواصل مع إدارة المنصة.', 'SCHOOL_SUSPENDED');
    }
  }

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
const resetPassword = async (targetUserId, requesterRole, requesterSchoolId, temporaryPassword = null) => {
  const user = await User.findById(targetUserId);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  if (requesterRole === 'school_admin' && String(user.schoolId) !== String(requesterSchoolId)) {
    throw new ApiError(403, 'Cannot reset password of a user outside your school');
  }

  const tempPassword = temporaryPassword || (crypto.randomBytes(4).toString('hex').toUpperCase() + '@1a');
  user.password = tempPassword;
  user.mustChangePassword = true;
  await user.save();

  return tempPassword;
};

/**
 * Public school owner registration: creates school + admin user atomically.
 */
const registerSchool = async ({ inviteCode, schoolName, schoolNameAr, subdomain, address, phone, email, admin }) => {
  const existingSchool = await School.findOne({
    name: schoolName,
    isDeleted: false,
  });
  if (existingSchool) {
    throw new ApiError(409, 'School name already taken');
  }

  const internalSubdomain = await buildInternalSchoolSubdomain(schoolName, subdomain);

  const existingUser = await User.findOne({
    $or: [{ nationalId: admin.nationalId }, ...(admin.phone ? [{ phone: admin.phone }] : [])],
    isDeleted: false,
  });
  if (existingUser) {
    throw new ApiError(409, 'Admin national ID or phone already in use');
  }

  const reservation = await registrationInviteService.reserveInvite(inviteCode);

  try {
    const school = await School.create({
      name: schoolName, nameAr: schoolNameAr || null, subdomain: internalSubdomain,
      address, phone, email, academicYear: getCurrentHijriAcademicYear(), status: 'active',
    });
    const adminUser = await User.create({
      schoolId: school._id,
      role: 'school_admin',
      nationalId: admin.nationalId,
      phone: admin.phone,
      email: admin.email,
      password: admin.password,
      name: admin.name,
      mustChangePassword: false,
    });
    await registrationInviteService.finalizeInvite(reservation.invite._id, reservation.reservationId, school._id);
    try {
      await sendEmailVerification(adminUser);
    } catch {
      // Registration remains valid and unverified if the mail provider is temporarily unavailable.
    }
    return { school, adminUser };
  } catch (err) {
    await School.deleteOne({ name: schoolName, subdomain: internalSubdomain });
    await registrationInviteService.releaseInvite(reservation.invite._id, reservation.reservationId);
    throw err;
  }
};

const requestEmailPasswordReset = async ({ identifier, email }) => {
  const user = await User.findOne({ nationalId: identifier, email: String(email).toLowerCase(), role: 'school_admin', isActive: true, isDeleted: false });
  if (!user || !user.emailVerifiedAt) return;
  const token = await createOneTimeToken(user._id, 'password_reset');
  const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${token}`;
  await sendMockEmail({
    to: user.email,
    subject: 'استعادة كلمة المرور - منصة بصمة',
    text: `تم طلب استعادة كلمة المرور. استخدم الرابط التالي خلال 15 دقيقة:\n${resetUrl}\nإذا لم تطلب ذلك فتجاهل الرسالة.`,
  });
};

const consumeToken = async (token, purpose) => PasswordResetToken.findOneAndUpdate(
  { tokenHash: _hashToken(token), purpose, usedAt: null, expiresAt: { $gt: new Date() } },
  { $set: { usedAt: new Date() } }, { new: true },
);

const completeEmailPasswordReset = async ({ token, newPassword }) => {
  const record = await consumeToken(token, 'password_reset');
  if (!record) throw new ApiError(400, 'رابط الاستعادة غير صالح أو منتهي', 'RESET_TOKEN_INVALID');
  const user = await User.findById(record.userId);
  if (!user || user.isDeleted) throw new ApiError(400, 'تعذر تحديث الحساب', 'RESET_TOKEN_INVALID');
  user.password = newPassword;
  user.mustChangePassword = false;
  user.refreshToken = null;
  await user.save();
};

const verifyEmail = async (token) => {
  const record = await consumeToken(token, 'email_verification');
  if (!record) throw new ApiError(400, 'رابط التحقق غير صالح أو منتهي', 'VERIFICATION_TOKEN_INVALID');
  await User.findByIdAndUpdate(record.userId, { $set: { emailVerifiedAt: new Date() } });
};

module.exports = {
  login, logout, refreshTokens, changePassword, resetPassword, registerSchool,
  requestEmailPasswordReset, completeEmailPasswordReset, verifyEmail,
  sendEmailVerification,
};
