const express = require('express');
const router = express.Router();

const {
  listClasses, getClassById, createClass, updateClass, deleteClass, getClassStudents,
} = require('../controllers/class.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createClassSchema, updateClassSchema } = require('../validators/class.validator');

router.use(authenticate, tenantMiddleware);

router.get('/', rbac('super_admin', 'school_admin', 'teacher'), listClasses);
router.post('/', rbac('school_admin'), validate(createClassSchema), createClass);
router.get('/:id', rbac('super_admin', 'school_admin', 'teacher'), getClassById);
router.get('/:id/students', rbac('super_admin', 'school_admin', 'teacher'), getClassStudents);
router.patch('/:id', rbac('school_admin'), validate(updateClassSchema), updateClass);
router.delete('/:id', rbac('school_admin'), deleteClass);

module.exports = router;
