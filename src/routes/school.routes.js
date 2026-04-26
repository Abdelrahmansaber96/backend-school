const express = require('express');
const router = express.Router();

const {
  listSchools, getSchoolById, createSchool, updateSchool, updateCurrentSchoolProfile, updateSettings, deleteSchool,
  getCurrentSchool, updateBranding,
} = require('../controllers/school.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  createSchoolSchema,
  updateSchoolSchema,
  updateCurrentSchoolProfileSchema,
  updateSettingsSchema,
  updateBrandingSchema,
} = require('../validators/school.validator');

// Public route — resolve current school from subdomain (no auth needed)
router.get('/current', getCurrentSchool);

// All routes below require authentication
router.use(authenticate);

router.get('/', rbac('super_admin'), listSchools);
router.post('/', rbac('super_admin'), validate(createSchoolSchema), createSchool);

router.put('/branding', rbac('super_admin', 'school_admin'), tenantMiddleware, validate(updateBrandingSchema), updateBranding);
router.patch('/profile', rbac('super_admin', 'school_admin'), tenantMiddleware, validate(updateCurrentSchoolProfileSchema), updateCurrentSchoolProfile);

router.get('/:id', rbac('super_admin', 'school_admin'), tenantMiddleware, getSchoolById);
router.patch('/:id', rbac('super_admin'), tenantMiddleware, validate(updateSchoolSchema), updateSchool);
router.patch('/:id/settings', rbac('super_admin', 'school_admin'), tenantMiddleware, validate(updateSettingsSchema), updateSettings);
router.delete('/:id', rbac('super_admin'), deleteSchool);

module.exports = router;
