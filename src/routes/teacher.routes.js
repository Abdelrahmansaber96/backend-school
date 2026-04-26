const express = require('express');
const router = express.Router();

const {
  listTeachers, getTeacherById, createTeacher, updateTeacher, deleteTeacher,
} = require('../controllers/teacher.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createTeacherSchema, updateTeacherSchema } = require('../validators/teacher.validator');

router.use(authenticate, tenantMiddleware);

router.get('/', rbac('super_admin', 'school_admin'), listTeachers);
router.post('/', rbac('school_admin'), validate(createTeacherSchema), createTeacher);
router.get('/:id', rbac('super_admin', 'school_admin', 'teacher'), getTeacherById);
router.patch('/:id', rbac('school_admin'), validate(updateTeacherSchema), updateTeacher);
router.delete('/:id', rbac('school_admin'), deleteTeacher);

module.exports = router;
