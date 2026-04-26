const express = require('express');
const router = express.Router();

const {
  listBehavior, getBehaviorById, createBehavior, updateBehavior, deleteBehavior,
} = require('../controllers/behavior.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createBehaviorSchema, updateBehaviorSchema } = require('../validators/behavior.validator');

router.use(authenticate, tenantMiddleware);

router.get('/', rbac('super_admin', 'school_admin', 'teacher', 'parent', 'student'), listBehavior);
router.post('/', rbac('school_admin', 'teacher'), validate(createBehaviorSchema), createBehavior);
router.get('/:id', rbac('super_admin', 'school_admin', 'teacher', 'parent', 'student'), getBehaviorById);
router.patch('/:id', rbac('school_admin', 'teacher'), validate(updateBehaviorSchema), updateBehavior);
router.delete('/:id', rbac('school_admin'), deleteBehavior);

module.exports = router;
