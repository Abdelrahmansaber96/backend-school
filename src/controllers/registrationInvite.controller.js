const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const service = require('../services/registrationInvite.service');

const create = asyncHandler(async (req, res) => {
  const result = await service.createInvite(req.body, { userId: req.user._id });
  return res.status(201).json(new ApiResponse(201, { invite: result.invite, code: result.code }, 'تم إنشاء كود التسجيل'));
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listInvites(req.query);
  return res.status(200).json(new ApiResponse(200, result.data, 'تم جلب أكواد التسجيل', result.meta));
});

const revoke = asyncHandler(async (req, res) => {
  const invite = await service.revokeInvite(req.params.id);
  return res.status(200).json(new ApiResponse(200, invite, 'تم إلغاء كود التسجيل'));
});

module.exports = { create, list, revoke };
