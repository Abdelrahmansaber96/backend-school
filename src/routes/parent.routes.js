const express = require('express');
const router = express.Router();

const {
  listParents, getMyParentProfile, getParentById, createParent, updateParent, deleteParent, getChildren,
} = require('../controllers/parent.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createParentSchema, updateParentSchema } = require('../validators/parent.validator');

router.use(authenticate, tenantMiddleware);

router.get('/', rbac('super_admin', 'school_admin'), listParents);
router.get('/me', rbac('parent'), getMyParentProfile);
router.post('/', rbac('school_admin'), validate(createParentSchema), createParent);
router.get('/:id', rbac('super_admin', 'school_admin', 'parent'), getParentById);
router.get('/:id/children', rbac('super_admin', 'school_admin', 'parent'), getChildren);
router.patch('/:id', rbac('school_admin'), validate(updateParentSchema), updateParent);
router.delete('/:id', rbac('school_admin'), deleteParent);

module.exports = router;
