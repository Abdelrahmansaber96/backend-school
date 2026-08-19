const express = require('express');
const authenticate = require('../middlewares/auth.middleware');
const rbac = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const controller = require('../controllers/registrationInvite.controller');
const { createInviteSchema, revokeInviteSchema } = require('../validators/registrationInvite.validator');

const router = express.Router();
router.use(authenticate, rbac('super_admin'));
router.get('/', controller.list);
router.post('/', validate(createInviteSchema), controller.create);
router.patch('/:id/revoke', validate(revokeInviteSchema), controller.revoke);

module.exports = router;
