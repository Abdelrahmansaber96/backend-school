const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const behaviorService = require('../services/behavior.service');

const getRequesterContext = (req) => ({
  role: req.user.role,
  userId: req.user._id,
});

const listBehavior = asyncHandler(async (req, res) => {
  const result = await behaviorService.listBehavior(req.query, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, result.data, 'Behavior records fetched', result.meta));
});

const getBehaviorById = asyncHandler(async (req, res) => {
  const record = await behaviorService.getBehaviorById(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, record, 'Behavior record fetched'));
});

const createBehavior = asyncHandler(async (req, res) => {
  const record = await behaviorService.createBehavior(req.body, req.schoolId, getRequesterContext(req));
  return res.status(201).json(new ApiResponse(201, record, 'Behavior record created'));
});

const updateBehavior = asyncHandler(async (req, res) => {
  const record = await behaviorService.updateBehavior(
    req.params.id, req.schoolId, getRequesterContext(req), req.body,
  );
  return res.status(200).json(new ApiResponse(200, record, 'Behavior record updated'));
});

const deleteBehavior = asyncHandler(async (req, res) => {
  await behaviorService.deleteBehavior(req.params.id, req.schoolId, getRequesterContext(req));
  return res.status(200).json(new ApiResponse(200, null, 'Behavior record deleted'));
});

module.exports = { listBehavior, getBehaviorById, createBehavior, updateBehavior, deleteBehavior };
