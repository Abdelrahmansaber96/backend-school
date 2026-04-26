const express = require('express');
const router = express.Router();

const { listLogs, getEntityLogs } = require('../controllers/auditLog.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');

router.use(authenticate, tenantMiddleware, rbac('super_admin', 'school_admin'));

router.get('/', listLogs);
router.get('/:entity/:entityId', getEntityLogs);

module.exports = router;
