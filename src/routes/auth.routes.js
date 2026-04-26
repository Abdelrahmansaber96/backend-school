const express = require('express');
const router = express.Router();

const { login, logout, refresh, changePassword, resetPassword, registerSchool } = require('../controllers/auth.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const { loginLimiter, authLimiter } = require('../middlewares/rateLimiter.middleware');
const validate = require('../middlewares/validate.middleware');
const { loginSchema, changePasswordSchema, resetPasswordSchema, registerSchoolSchema } = require('../validators/auth.validator');

router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/register-school', authLimiter, validate(registerSchoolSchema), registerSchool);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.patch('/change-password', authenticate, validate(changePasswordSchema), changePassword);
router.post('/reset-password/:userId', authenticate, tenantMiddleware, validate(resetPasswordSchema), resetPassword);

module.exports = router;
