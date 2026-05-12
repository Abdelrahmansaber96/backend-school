const express = require('express');
const router = express.Router();

const {
  getAttendance, createAttendance, bulkCreateAttendance,
  updateAttendance, deleteAttendance, getStudentSummary,
} = require('../controllers/attendance.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  createAttendanceSchema, bulkAttendanceSchema, updateAttendanceSchema,
} = require('../validators/attendance.validator');

router.use(authenticate, tenantMiddleware);

router.get('/', rbac('super_admin', 'school_admin', 'teacher', 'parent', 'student', 'administrative'), getAttendance);
router.post('/', rbac('school_admin', 'teacher', 'administrative'), validate(createAttendanceSchema), createAttendance);
router.post('/bulk', rbac('school_admin', 'teacher', 'administrative'), validate(bulkAttendanceSchema), bulkCreateAttendance);
router.get('/summary/:studentId', rbac('super_admin', 'school_admin', 'teacher', 'parent', 'student', 'administrative'), getStudentSummary);
router.patch('/:id', rbac('school_admin', 'teacher', 'administrative'), validate(updateAttendanceSchema), updateAttendance);
router.delete('/:id', rbac('school_admin', 'administrative'), deleteAttendance);

module.exports = router;
