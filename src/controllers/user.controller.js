const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const userService = require('../services/user.service');

const getMe = asyncHandler(async (req, res) => {
  const user = await userService.getMe(req.user._id);
  return res.status(200).json(new ApiResponse(200, user, 'Profile fetched'));
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await userService.updateMe(req.user._id, req.body);
  return res.status(200).json(new ApiResponse(200, user, 'Profile updated'));
});

const listUsers = asyncHandler(async (req, res) => {
  const result = await userService.listUsers(req.query, req.schoolId);
  return res.status(200).json(new ApiResponse(200, result.data, 'Users fetched', result.meta));
});

const getUserById = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id, req.user.role, req.schoolId);
  return res.status(200).json(new ApiResponse(200, user, 'User fetched'));
});

const activateUser = asyncHandler(async (req, res) => {
  const user = await userService.setActiveStatus(
    req.params.id,
    true,
    req.user.role,
    req.schoolId,
    req.user._id,
  );
  return res.status(200).json(new ApiResponse(200, user, 'User activated'));
});

const deactivateUser = asyncHandler(async (req, res) => {
  const user = await userService.setActiveStatus(
    req.params.id,
    false,
    req.user.role,
    req.schoolId,
    req.user._id,
  );
  return res.status(200).json(new ApiResponse(200, user, 'User deactivated'));
});

const deleteUser = asyncHandler(async (req, res) => {
  await userService.deleteUser(req.params.id, req.user.role, req.schoolId);
  return res.status(200).json(new ApiResponse(200, null, 'User deleted'));
});

module.exports = { getMe, updateMe, listUsers, getUserById, activateUser, deactivateUser, deleteUser };
