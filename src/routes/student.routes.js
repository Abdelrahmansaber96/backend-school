const express = require('express');
const router = express.Router();

const {
  listStudents, getStudentById, getMyStudentProfile, createStudent, importStudents, updateStudent, deleteStudent,
} = require('../controllers/student.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createUploader } = require('../middlewares/upload.middleware');
const { uploadLimiter } = require('../middlewares/rateLimiter.middleware');
const { createStudentSchema, updateStudentSchema } = require('../validators/student.validator');

router.use(authenticate, tenantMiddleware);

router.get('/', rbac('super_admin', 'school_admin', 'teacher'), listStudents);
router.post('/import', rbac('school_admin'), uploadLimiter, (req, res, next) => {
  const uploader = createUploader('import');
  uploader.single('file')(req, res, next);
}, importStudents);
router.post('/', rbac('school_admin'), validate(createStudentSchema), createStudent);
router.get('/me', rbac('student'), getMyStudentProfile);
router.get('/:id', rbac('super_admin', 'school_admin', 'teacher', 'parent', 'student'), getStudentById);
router.patch('/:id', rbac('school_admin'), validate(updateStudentSchema), updateStudent);
router.delete('/:id', rbac('school_admin'), deleteStudent);

module.exports = router;
