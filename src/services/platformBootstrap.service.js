const User = require('../models/User.model');
const config = require('../config/env');
const logger = require('../utils/logger');

const ensureInitialSuperAdmin = async () => {
  if (!config.INITIAL_SUPER_ADMIN_ENABLED) return null;

  const existingSuperAdmin = await User.findOne({
    role: 'super_admin',
    isDeleted: { $ne: true },
  }).select('_id');

  if (existingSuperAdmin) return existingSuperAdmin;

  const conflictingUser = await User.findOne({
    $or: [
      { nationalId: config.INITIAL_SUPER_ADMIN_NATIONAL_ID },
      { phone: config.INITIAL_SUPER_ADMIN_PHONE },
      { email: config.INITIAL_SUPER_ADMIN_EMAIL },
    ],
  }).select('+password role nationalId phone email isActive isDeleted');

  if (conflictingUser) {
    const isExactBootstrapIdentity = conflictingUser.nationalId === config.INITIAL_SUPER_ADMIN_NATIONAL_ID
      && conflictingUser.phone === config.INITIAL_SUPER_ADMIN_PHONE
      && conflictingUser.email === config.INITIAL_SUPER_ADMIN_EMAIL.toLowerCase();

    if (!isExactBootstrapIdentity) {
      throw new Error('Initial super admin identity partially conflicts with an existing user');
    }

    conflictingUser.role = 'super_admin';
    conflictingUser.schoolId = null;
    conflictingUser.password = config.INITIAL_SUPER_ADMIN_PASSWORD;
    conflictingUser.isActive = true;
    conflictingUser.isDeleted = false;
    conflictingUser.deletedAt = null;
    conflictingUser.failedLoginAttempts = 0;
    conflictingUser.lockedUntil = null;
    conflictingUser.refreshToken = null;
    conflictingUser.mustChangePassword = true;
    conflictingUser.emailVerifiedAt = conflictingUser.emailVerifiedAt || new Date();
    await conflictingUser.save();

    logger.warn('Existing bootstrap identity restored as initial super admin; password change is required');
    return conflictingUser;
  }

  const superAdmin = await User.create({
    name: {
      first: config.INITIAL_SUPER_ADMIN_FIRST_NAME,
      last: config.INITIAL_SUPER_ADMIN_LAST_NAME,
    },
    nationalId: config.INITIAL_SUPER_ADMIN_NATIONAL_ID,
    phone: config.INITIAL_SUPER_ADMIN_PHONE,
    email: config.INITIAL_SUPER_ADMIN_EMAIL,
    emailVerifiedAt: new Date(),
    password: config.INITIAL_SUPER_ADMIN_PASSWORD,
    role: 'super_admin',
    schoolId: null,
    isActive: true,
    mustChangePassword: true,
  });

  logger.warn('Initial super admin created; password change is required on first login');
  return superAdmin;
};

module.exports = { ensureInitialSuperAdmin };
