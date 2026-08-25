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
  }).select('_id role');

  if (conflictingUser) {
    throw new Error('Initial super admin identity conflicts with an existing user');
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
