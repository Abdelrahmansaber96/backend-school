const express = require('express');
const router = express.Router();

const {
  listGrades,
  getGradeById,
  createGrade,
  updateGrade,
  deleteGrade,
  getStudentGradeProfile,
} = require('../controllers/grade.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createGradeSchema, updateGradeSchema } = require('../validators/grade.validator');

router.use(authenticate, tenantMiddleware);

router.get('/', rbac('super_admin', 'school_admin', 'teacher', 'parent', 'student'), listGrades);
router.get('/student/:studentId/profile', rbac('super_admin', 'school_admin', 'teacher', 'parent', 'student'), getStudentGradeProfile);
router.post('/', rbac('school_admin', 'teacher'), validate(createGradeSchema), createGrade);
router.get('/:id', rbac('super_admin', 'school_admin', 'teacher', 'parent', 'student'), getGradeById);
router.patch('/:id', rbac('school_admin', 'teacher'), validate(updateGradeSchema), updateGrade);
router.delete('/:id', rbac('school_admin', 'teacher'), deleteGrade);

module.exports = router;