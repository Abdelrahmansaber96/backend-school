const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const classService = require('../services/class.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
  userId: req.user._id,
});

const listClasses = asyncHandler(async (req, res) => {
  const result = await classService.listClasses(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result.data, 'Classes fetched', result.meta));
});

const getClassById = asyncHandler(async (req, res) => {
  const cls = await classService.getClassById(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, cls, 'Class fetched'));
});

const createClass = asyncHandler(async (req, res) => {
  const cls = await classService.createClass(req.body, req.schoolId, getRequesterContext(req));
  return res.status(201).json(new ApiResponse(201, cls, 'Class created'));
});

const updateClass = asyncHandler(async (req, res) => {
  const cls = await classService.updateClass(req.params.id, req.schoolId, req.body, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, cls, 'Class updated'));
});

const deleteClass = asyncHandler(async (req, res) => {
  await classService.deleteClass(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, null, 'Class deleted'));
});

const getClassStudents = asyncHandler(async (req, res) => {
  const result = await classService.getClassStudents(req.params.id, req.schoolId, req.query, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result.data, 'Class students fetched', result.meta));
});

module.exports = { listClasses, getClassById, createClass, updateClass, deleteClass, getClassStudents };
