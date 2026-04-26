const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const cloudinary = require('../config/cloudinary');
const config = require('../config/env');
const FileUpload = require('../models/FileUpload.model');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');

const LOCAL_PUBLIC_PREFIX = 'local/';
const LOCAL_UPLOADS_ROOT = path.resolve(__dirname, '..', '..', config.LOCAL_UPLOADS_DIR);

const sanitizeFileName = (value = '') => value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'file';

const toLocalStoragePaths = ({ schoolId, context, originalName }) => {
  const extension = path.extname(originalName || '') || '';
  const baseName = sanitizeFileName(path.basename(originalName || 'file', extension));
  const fileName = `${Date.now()}-${baseName}-${randomUUID()}${extension}`;
  const relativePath = path.join(String(schoolId), context, fileName).replace(/\\/g, '/');

  return {
    relativePath,
    absolutePath: path.join(LOCAL_UPLOADS_ROOT, relativePath),
    publicId: `${LOCAL_PUBLIC_PREFIX}${relativePath}`,
    url: `${config.BACKEND_URL}/local-uploads/${relativePath}`,
  };
};

const uploadFileLocally = async (file, { schoolId, uploadedBy, context, contextId }) => {
  const { absolutePath, relativePath, publicId, url } = toLocalStoragePaths({
    schoolId,
    context,
    originalName: file.originalname,
  });

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, file.buffer);

  return FileUpload.create({
    schoolId,
    uploadedBy,
    fileName: file.originalname,
    fileType: _resolveFileType(file.mimetype),
    mimeType: file.mimetype,
    size: file.size,
    url,
    publicId,
    context,
    contextId: contextId || null,
    isOrphaned: true,
    metadata: { relativePath },
  });
};

const deleteLocalFile = async (record) => {
  const relativePath = String(record.publicId || '').replace(LOCAL_PUBLIC_PREFIX, '');
  if (!relativePath) return;

  await fs.rm(path.join(LOCAL_UPLOADS_ROOT, relativePath), { force: true });
};

/**
 * Upload a file buffer to Cloudinary and record in DB
 */
const uploadFile = async (file, { schoolId, uploadedBy, context, contextId }) => {
  if (!cloudinary.isConfigured) {
    return uploadFileLocally(file, { schoolId, uploadedBy, context, contextId });
  }

  const folder = `basma/${schoolId}/${context}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        use_filename: true,
        unique_filename: true,
      },
      async (error, result) => {
        if (error) return reject(new ApiError(500, 'File upload to cloud failed', 'UPLOAD_FAILED'));

        try {
          const record = await FileUpload.create({
            schoolId,
            uploadedBy,
            fileName: file.originalname,
            fileType: _resolveFileType(file.mimetype),
            mimeType: file.mimetype,
            size: file.size,
            url: result.secure_url,
            publicId: result.public_id,
            context,
            contextId: contextId || null,
            isOrphaned: true, // will be set to false when linked to an entity
          });

          resolve(record);
        } catch (dbErr) {
          reject(dbErr);
        }
      },
    );
    stream.end(file.buffer);
  });
};

/**
 * Delete a file from Cloudinary and DB
 */
const deleteFile = async (publicId, schoolId, uploadedBy, userRole) => {
  const record = await FileUpload.findOne({ publicId, schoolId });
  if (!record) throw new ApiError(404, 'File not found');

  if (userRole !== 'super_admin' && userRole !== 'school_admin') {
    if (String(record.uploadedBy) !== String(uploadedBy)) {
      throw new ApiError(403, 'You can only delete your own files');
    }
  }

  if (String(record.publicId).startsWith(LOCAL_PUBLIC_PREFIX)) {
    await deleteLocalFile(record);
  } else {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
  }

  await FileUpload.findByIdAndDelete(record._id);
};

/**
 * Mark a file as no longer orphaned (linked to an entity)
 */
const linkFile = async (publicId, contextId, schoolId) => {
  await FileUpload.findOneAndUpdate({ publicId, schoolId }, { $set: { isOrphaned: false, contextId } });
};

const listUploads = async (query, schoolId, requester = {}) => {
  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['createdAt', 'fileName', 'context'], 'createdAt');
  const filter = {};

  if (schoolId) filter.schoolId = schoolId;
  if (query.context) filter.context = query.context;
  if (query.contextId) filter.contextId = query.contextId;
  if (query.isOrphaned !== undefined) filter.isOrphaned = query.isOrphaned === 'true';

  if (!['super_admin', 'school_admin'].includes(requester.role)) {
    filter.uploadedBy = requester.userId;
  }

  const [files, total] = await Promise.all([
    FileUpload.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FileUpload.countDocuments(filter),
  ]);

  return {
    data: files,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt', 'fileName', 'context'],
      defaultSortField: 'createdAt',
    }),
  };
};

/**
 * Clean up orphaned files older than 24 hours (called by a cron job)
 */
const cleanOrphans = async () => {
  const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const orphans = await FileUpload.find({ isOrphaned: true, createdAt: { $lt: threshold } });

  let deleted = 0;
  for (const file of orphans) {
    try {
      if (String(file.publicId).startsWith(LOCAL_PUBLIC_PREFIX)) {
        await deleteLocalFile(file);
      } else {
        await cloudinary.uploader.destroy(file.publicId, { resource_type: 'auto' });
      }

      await FileUpload.findByIdAndDelete(file._id);
      deleted++;
    } catch (err) {
      logger.error(`Failed to delete orphan file ${file.publicId}: ${err.message}`);
    }
  }
  return deleted;
};

const _resolveFileType = (mimeType) => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.includes('sheet') || mimeType.includes('csv')) return 'spreadsheet';
  return 'document';
};

module.exports = { uploadFile, deleteFile, linkFile, listUploads, cleanOrphans };
