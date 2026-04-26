const express = require('express');
const router = express.Router();

const {
  listSubjects, getSubjectById, createSubject, updateSubject, deleteSubject,
} = require('../controllers/subject.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createSubjectSchema, updateSubjectSchema } = require('../validators/subject.validator');

router.use(authenticate, tenantMiddleware);

router.get('/', rbac('super_admin', 'school_admin', 'teacher'), listSubjects);
router.post('/', rbac('school_admin'), validate(createSubjectSchema), createSubject);
router.get('/:id', rbac('super_admin', 'school_admin', 'teacher'), getSubjectById);
router.patch('/:id', rbac('school_admin'), validate(updateSubjectSchema), updateSubject);
router.delete('/:id', rbac('school_admin'), deleteSubject);

module.exports = router;
