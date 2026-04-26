const express = require('express');
const router = express.Router();

const { listUploads, uploadFile, deleteFile } = require('../controllers/upload.controller');
const authenticate = require('../middlewares/auth.middleware');
const tenantMiddleware = require('../middlewares/tenant.middleware');
const { createUploader } = require('../middlewares/upload.middleware');
const { uploadLimiter } = require('../middlewares/rateLimiter.middleware');

router.use(authenticate, tenantMiddleware, uploadLimiter);

// context: avatar | behavior | message | import
router.get('/', listUploads);
router.post('/:context', (req, res, next) => {
  const uploader = createUploader(req.params.context);
  uploader.single('file')(req, res, next);
}, uploadFile);

router.delete('/:publicId(*)', deleteFile);

module.exports = router;
