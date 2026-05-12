const express = require('express');
const router = express.Router();

const {
  getMe, updateMe, listUsers, getUserById, activateUser, deactivateUser, deleteUser, createAdministrativeUser,
} = require('../controllers/user.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createAdministrativeUserSchema } = require('../validators/user.validator');

// All user routes require authentication
router.use(authenticate);

router.get('/me', getMe);
router.patch('/me', updateMe);

router.use(tenantMiddleware);
router.post('/administrative', rbac('school_admin'), validate(createAdministrativeUserSchema), createAdministrativeUser);
router.get('/', rbac('super_admin', 'school_admin'), listUsers);
router.get('/:id', rbac('super_admin', 'school_admin'), getUserById);
router.patch('/:id/activate', rbac('super_admin', 'school_admin'), activateUser);
router.patch('/:id/deactivate', rbac('super_admin', 'school_admin'), deactivateUser);
router.delete('/:id', rbac('super_admin', 'school_admin'), deleteUser);

module.exports = router;
