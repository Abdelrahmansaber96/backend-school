const express = require('express');
const router = express.Router();

const { getDashboard } = require('../controllers/dashboard.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');

router.use(authenticate, tenantMiddleware);

router.get('/', rbac('super_admin', 'school_admin', 'teacher', 'administrative', 'parent', 'student'), getDashboard);

module.exports = router;
