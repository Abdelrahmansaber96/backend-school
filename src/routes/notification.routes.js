const express = require('express');
const router = express.Router();

const {
  listNotifications, markRead, markAllRead, getUnreadCount,
} = require('../controllers/notification.controller');
const authenticate = require('../middlewares/auth.middleware');

router.use(authenticate);

router.get('/', listNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/mark-all-read', markAllRead);
router.patch('/:id/read', markRead);

module.exports = router;
