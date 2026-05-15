const express = require('express');
const router = express.Router();

const {
  listClasses, getClassById, createClass, importClasses, updateClass, deleteClass, getClassStudents,
} = require('../controllers/class.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createUploader } = require('../middlewares/upload.middleware');
const { uploadLimiter } = require('../middlewares/rateLimiter.middleware');
const { createClassSchema, updateClassSchema } = require('../validators/class.validator');

router.use(authenticate, tenantMiddleware);

router.get('/', rbac('super_admin', 'school_admin', 'teacher'), listClasses);
router.post('/import', rbac('school_admin'), uploadLimiter, (req, res, next) => {
  const uploader = createUploader('import');
  uploader.single('file')(req, res, next);
}, importClasses);
router.post('/', rbac('school_admin'), validate(createClassSchema), createClass);
router.get('/:id', rbac('super_admin', 'school_admin', 'teacher'), getClassById);
router.get('/:id/students', rbac('super_admin', 'school_admin', 'teacher'), getClassStudents);
router.patch('/:id', rbac('school_admin'), validate(updateClassSchema), updateClass);
router.delete('/:id', rbac('school_admin'), deleteClass);

module.exports = router;
