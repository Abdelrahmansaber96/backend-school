const express = require('express');
const router = express.Router();

const {
  login, logout, refresh, changePassword, resetPassword, registerSchool,
  requestEmailPasswordReset, completeEmailPasswordReset, verifyEmail,
} = require('../controllers/auth.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');
const { loginLimiter, authLimiter } = require('../middlewares/rateLimiter.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  loginSchema, changePasswordSchema, resetPasswordSchema, registerSchoolSchema,
  requestEmailResetSchema, completeEmailResetSchema, verifyEmailSchema,
} = require('../validators/auth.validator');
const recoveryController = require('../controllers/studentRecovery.controller');
const {
  identifySchema, submitSchema, completeSchema, issueCodeSchema,
} = require('../validators/studentRecovery.validator');

router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/register-school', authLimiter, validate(registerSchoolSchema), registerSchool);
router.post('/forgot-password/email', authLimiter, validate(requestEmailResetSchema), requestEmailPasswordReset);
router.post('/reset-password/email', authLimiter, validate(completeEmailResetSchema), completeEmailPasswordReset);
router.post('/verify-email', authLimiter, validate(verifyEmailSchema), verifyEmail);
router.post('/student-recovery/identify', authLimiter, validate(identifySchema), recoveryController.identify);
router.post('/student-recovery/requests', authLimiter, validate(submitSchema), recoveryController.submit);
router.post('/student-recovery/complete', authLimiter, validate(completeSchema), recoveryController.complete);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.patch('/change-password', authenticate, validate(changePasswordSchema), changePassword);
router.post('/reset-password/:userId', authenticate, tenantMiddleware, validate(resetPasswordSchema), resetPassword);
router.get('/student-recovery/requests', authenticate, tenantMiddleware, rbac('school_admin'), recoveryController.list);
router.post('/student-recovery/requests/:id/issue-code', authenticate, tenantMiddleware, rbac('school_admin'), validate(issueCodeSchema), recoveryController.issueCode);

module.exports = router;
