const User = require('../models/User.model');
const config = require('../config/env');
const logger = require('../utils/logger');

const ensureInitialSuperAdmin = async () => {
  if (!config.INITIAL_SUPER_ADMIN_ENABLED) return null;

  const existingSuperAdmin = await User.findOne({
    role: 'super_admin',
    isActive: true,
    isDeleted: { $ne: true },
  }).select('_id');

  if (existingSuperAdmin) return existingSuperAdmin;

  // The national ID is the stable bootstrap identity. Keep any existing phone/email
  // to avoid overwriting legitimate unique values from an older installation.
  const bootstrapUser = await User.findOne({
    nationalId: config.INITIAL_SUPER_ADMIN_NATIONAL_ID,
  }).select('+password role nationalId phone email isActive isDeleted');

  if (bootstrapUser) {
    bootstrapUser.role = 'super_admin';
    bootstrapUser.schoolId = null;
    bootstrapUser.password = config.INITIAL_SUPER_ADMIN_PASSWORD;
    bootstrapUser.isActive = true;
    bootstrapUser.isDeleted = false;
    bootstrapUser.deletedAt = null;
    bootstrapUser.failedLoginAttempts = 0;
    bootstrapUser.lockedUntil = null;
    bootstrapUser.refreshToken = null;
    bootstrapUser.mustChangePassword = true;
    bootstrapUser.emailVerifiedAt = bootstrapUser.emailVerifiedAt || new Date();
    await bootstrapUser.save();

    logger.warn('Existing bootstrap identity restored as initial super admin; password change is required');
    return bootstrapUser;
  }

  const conflictingContact = await User.findOne({
    $or: [
      { phone: config.INITIAL_SUPER_ADMIN_PHONE },
      { email: config.INITIAL_SUPER_ADMIN_EMAIL },
    ],
  }).select('_id');

  if (conflictingContact) {
    throw new Error('Initial super admin phone or email conflicts with an existing user');
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
