const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const parentService = require('../services/parent.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
  userId: req.user._id,
});

const listParents = asyncHandler(async (req, res) => {
  const result = await parentService.listParents(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result.data, 'Parents fetched', result.meta));
});

const getMyParentProfile = asyncHandler(async (req, res) => {
  const parent = await parentService.getParentByUserId(req.user._id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, parent, 'Parent fetched'));
});

const getParentById = asyncHandler(async (req, res) => {
  const parent = await parentService.getParentById(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, parent, 'Parent fetched'));
});

const createParent = asyncHandler(async (req, res) => {
  const result = await parentService.createParent(req.body, req.schoolId, getRequesterContext(req));
  return res.status(201).json(
    new ApiResponse(201, { parent: result.parent, tempPassword: result.tempPassword }, 'Parent created'),
  );
});

const updateParent = asyncHandler(async (req, res) => {
  const parent = await parentService.updateParent(req.params.id, req.schoolId, req.body, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, parent, 'Parent updated'));
});

const deleteParent = asyncHandler(async (req, res) => {
  await parentService.deleteParent(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, null, 'Parent deleted'));
});

const getChildren = asyncHandler(async (req, res) => {
  const children = await parentService.getChildren(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, children, 'Children fetched'));
});

module.exports = {
  listParents,
  getMyParentProfile,
  getParentById,
  createParent,
  updateParent,
  deleteParent,
  getChildren,
};
