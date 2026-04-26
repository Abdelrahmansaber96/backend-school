const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const uploadService = require('../services/upload.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
  userId: req.user._id,
});

const listUploads = asyncHandler(async (req, res) => {
  const result = await uploadService.listUploads(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result.data, 'Uploads fetched', result.meta));
});

const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'No file provided');
  }

  const { context } = req.params;
  const record = await uploadService.uploadFile(req.file, {
    schoolId: req.schoolId,
    uploadedBy: req.user._id,
    context,
    contextId: req.body.contextId || null,
  });

  return res.status(201).json(new ApiResponse(201, record, 'File uploaded successfully'));
});

const deleteFile = asyncHandler(async (req, res) => {
  await uploadService.deleteFile(req.params.publicId, req.schoolId, req.user._id, req.user.role);
  return res.status(200).json(new ApiResponse(200, null, 'File deleted'));
});

module.exports = { listUploads, uploadFile, deleteFile };
