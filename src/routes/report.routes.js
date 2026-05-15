const express = require('express');
const router = express.Router();

const {
	attendanceReport,
	behaviorReport,
	gradeReport,
	studentReport,
	exportAttendanceReport,
	exportBehaviorReport,
	schoolSummary,
} = require('../controllers/report.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');

router.use(authenticate, tenantMiddleware);

router.get('/attendance/export', rbac('super_admin', 'school_admin', 'teacher'), exportAttendanceReport);
router.get('/attendance', rbac('super_admin', 'school_admin', 'teacher'), attendanceReport);
router.get('/behavior/export', rbac('super_admin', 'school_admin', 'teacher'), exportBehaviorReport);
router.get('/behavior', rbac('super_admin', 'school_admin', 'teacher'), behaviorReport);
	router.get('/grades', rbac('super_admin', 'school_admin', 'teacher'), gradeReport);
	router.get('/student', rbac('super_admin', 'school_admin', 'teacher', 'parent', 'student'), studentReport);
router.get('/summary', rbac('super_admin', 'school_admin'), schoolSummary);

module.exports = router;
