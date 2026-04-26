const multer = require('multer');
const ApiError = require('../utils/ApiError');

const ALLOWED_TYPES = {
  avatar: ['image/jpeg', 'image/png', 'image/webp'],
  behavior: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  message: [
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  import: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ],
};

const MAX_SIZE = {
  avatar: 2 * 1024 * 1024,    // 2 MB
  behavior: 5 * 1024 * 1024,  // 5 MB
  message: 10 * 1024 * 1024,  // 10 MB
  import: 5 * 1024 * 1024,    // 5 MB
};

const storage = multer.memoryStorage();

const createUploader = (context) =>
  multer({
    storage,
    limits: { fileSize: MAX_SIZE[context] || 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ALLOWED_TYPES[context] || [];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new ApiError(400, `File type ${file.mimetype} not allowed for ${context}`));
      }
    },
  });

module.exports = { createUploader };
