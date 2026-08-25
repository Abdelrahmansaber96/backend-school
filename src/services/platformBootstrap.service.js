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

  let bootstrapPhone = config.INITIAL_SUPER_ADMIN_PHONE;
  let bootstrapEmail = config.INITIAL_SUPER_ADMIN_EMAIL.toLowerCase();

  const [phoneConflict, emailConflict] = await Promise.all([
    User.exists({ phone: bootstrapPhone }),
    User.exists({ email: bootstrapEmail }),
  ]);

  if (phoneConflict) {
    for (let suffix = 1; suffix <= 99999; suffix += 1) {
      const candidate = `05999${String(suffix).padStart(5, '0')}`;
      // Sequential by design: stop as soon as the first deterministic value is free.
      // eslint-disable-next-line no-await-in-loop
      if (!await User.exists({ phone: candidate })) {
        bootstrapPhone = candidate;
        break;
      }
    }
  }

  if (emailConflict) {
    const emailLocalPart = `platform-admin.${config.INITIAL_SUPER_ADMIN_NATIONAL_ID}`;
    bootstrapEmail = `${emailLocalPart}@basma.local`;
    let suffix = 1;
    while (await User.exists({ email: bootstrapEmail })) {
      bootstrapEmail = `${emailLocalPart}.${suffix}@basma.local`;
      suffix += 1;
    }
  }

  const superAdmin = await User.create({
    name: {
      first: config.INITIAL_SUPER_ADMIN_FIRST_NAME,
      last: config.INITIAL_SUPER_ADMIN_LAST_NAME,
    },
    nationalId: config.INITIAL_SUPER_ADMIN_NATIONAL_ID,
    phone: bootstrapPhone,
    email: bootstrapEmail,
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
