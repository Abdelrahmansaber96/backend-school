const express = require('express');
const router = express.Router();

const {
  listConversations, getOrCreateConversation, getMessages, sendMessage, markRead,
} = require('../controllers/messaging.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const rbac = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createConversationSchema, sendMessageSchema } = require('../validators/messaging.validator');

router.use(authenticate, tenantMiddleware);

const allowedRoles = ['school_admin', 'teacher', 'parent'];

router.get('/', rbac(...allowedRoles), listConversations);
router.post('/', rbac(...allowedRoles), validate(createConversationSchema), getOrCreateConversation);
router.get('/:id/messages', rbac(...allowedRoles), getMessages);
router.post('/:id/messages', rbac(...allowedRoles), validate(sendMessageSchema), sendMessage);
router.patch('/:id/read', rbac(...allowedRoles), markRead);

module.exports = router;
