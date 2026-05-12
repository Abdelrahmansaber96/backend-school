const User = require('../models/User.model');
const ApiError = require('../utils/ApiError');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');

const buildAdministrativeTempPassword = (nationalId) => `Admin@${String(nationalId || '').slice(-4)}`;

/**
 * Get the currently authenticated user's profile
 */
const getMe = async (userId) => {
  const user = await User.findById(userId).select('-refreshToken');
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');
  return user;
};

/**
 * List users within a school with filters
 */
const listUsers = async (query, schoolId) => {
  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['createdAt', 'name.first', 'role']);

  const filter = { schoolId, isDeleted: false, role: { $ne: 'student' } };
  if (query.role && query.role !== 'student') filter.role = query.role;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.search) {
    filter.$or = [
      { 'name.first': { $regex: query.search, $options: 'i' } },
      { 'name.last': { $regex: query.search, $options: 'i' } },
      { nationalId: { $regex: query.search, $options: 'i' } },
      { phone: { $regex: query.search, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter).skip(skip).limit(limit).sort(sort),
    User.countDocuments(filter),
  ]);

  return {
    data: users,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt', 'name.first', 'role'],
    }),
  };
};

/**
 * Update own profile (name, phone, email, avatar)
 */
const updateMe = async (userId, updates) => {
  const allowed = ['name', 'phone', 'email', 'avatar'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k)),
  );

  const user = await User.findByIdAndUpdate(userId, { $set: filtered }, { new: true, runValidators: true });
  if (!user) throw new ApiError(404, 'User not found');
  return user;
};

/**
 * Get a single user by id (scoped to school unless super_admin)
 */
const getUserById = async (userId, requesterRole, requesterSchoolId) => {
  const user = await User.findById(userId);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  if (requesterRole !== 'super_admin' && String(user.schoolId) !== String(requesterSchoolId)) {
    throw new ApiError(403, 'Forbidden');
  }

  return user;
};

/**
 * Activate or deactivate a user account
 */
const setActiveStatus = async (targetId, isActive, requesterRole, requesterSchoolId, requesterId) => {
  const user = await User.findById(targetId);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  if (requesterRole === 'school_admin' && String(user.schoolId) !== String(requesterSchoolId)) {
    throw new ApiError(403, 'Forbidden');
  }
  if (user.role === 'super_admin') throw new ApiError(403, 'Cannot change status of super admin');
  if (!isActive && requesterId && String(user._id) === String(requesterId)) {
    throw new ApiError(400, 'You cannot deactivate your own account');
  }

  user.isActive = isActive;
  await user.save({ validateBeforeSave: false });
  return user;
};

/**
 * Soft-delete a user
 */
const deleteUser = async (targetId, requesterRole, requesterSchoolId) => {
  const user = await User.findById(targetId);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  if (requesterRole === 'school_admin' && String(user.schoolId) !== String(requesterSchoolId)) {
    throw new ApiError(403, 'Forbidden');
  }
  if (user.role === 'super_admin') throw new ApiError(403, 'Cannot delete super admin');

  user.isDeleted = true;
  user.deletedAt = new Date();
  user.isActive = false;
  await user.save({ validateBeforeSave: false });
};

const createAdministrativeUser = async (data, schoolId, requester = {}) => {
  if (requester.role !== 'school_admin') {
    throw new ApiError(403, 'Forbidden');
  }

  const { name, nationalId, phone, email } = data;
  const existingFilters = [
    { nationalId },
    { phone },
    ...(email ? [{ email }] : []),
  ];

  const existingUser = await User.findOne({
    isDeleted: false,
    $or: existingFilters,
  });

  if (existingUser) {
    throw new ApiError(409, 'National ID, phone, or email already in use');
  }

  const tempPassword = buildAdministrativeTempPassword(nationalId);

  const user = await User.create({
    schoolId,
    role: 'administrative',
    nationalId,
    phone,
    email: email || null,
    password: tempPassword,
    name,
    mustChangePassword: true,
  });

  return { user, tempPassword };
};

module.exports = {
  getMe,
  listUsers,
  updateMe,
  getUserById,
  setActiveStatus,
  deleteUser,
  createAdministrativeUser,
};
