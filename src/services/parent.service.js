const Parent = require('../models/Parent.model');
const User = require('../models/User.model');
const Student = require('../models/Student.model');
const ApiError = require('../utils/ApiError');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');
const {
  getParentScope,
  ensureParentProfileAccess,
} = require('../utils/accessScope');
const { assertRequesterRole } = require('../utils/authorization');

const buildParentQuery = (filter) => Parent.findOne(filter)
  .populate('userId', 'name phone email avatar isActive lastLogin')
  .populate({ path: 'children', populate: [{ path: 'userId', select: 'name' }, { path: 'classId', select: 'name grade section' }] });

const listParents = async (query, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin']);

  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['createdAt']);
  const filter = { isDeleted: false };
  if (schoolId) filter.schoolId = schoolId;

  if (query.search) {
    filter.$or = [
      { nationalId: { $regex: query.search, $options: 'i' } },
    ];
  }

  const [parents, total] = await Promise.all([
    Parent.find(filter)
      .populate('userId', 'name phone email avatar isActive')
      .populate('children', 'userId classId')
      .skip(skip).limit(limit).sort(sort),
    Parent.countDocuments(filter),
  ]);

  return {
    data: parents,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt'],
    }),
  };
};

const getParentByUserId = async (userId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['parent']);

  const parent = await buildParentQuery({ userId, schoolId, isDeleted: false });
  if (!parent) throw new ApiError(404, 'Parent profile not found');
  return parent;
};

const getParentById = async (parentId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'parent']);

  if (requester.role === 'parent') {
    const parentScope = await getParentScope(requester.userId, schoolId);
    ensureParentProfileAccess(parentId, parentScope);
  }

  const parent = await buildParentQuery({ _id: parentId, schoolId, isDeleted: false });
  if (!parent) throw new ApiError(404, 'Parent not found');

  return parent;
};

const createParent = async (data, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const { nationalId, name, phone, email, occupation, address } = data;

  const existing = await User.findOne({ $or: [{ nationalId }, { phone }], isDeleted: false });
  if (existing) throw new ApiError(409, 'National ID or phone already in use');

  const tempPassword = `Parent@${nationalId.slice(-4)}`;

  const user = await User.create({
    schoolId, role: 'parent', nationalId, phone, email,
    password: tempPassword,
    name, mustChangePassword: true,
  });

  const parent = await Parent.create({ userId: user._id, schoolId, nationalId, occupation, address });

  return { parent, tempPassword };
};

const updateParent = async (parentId, schoolId, updates, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const parent = await Parent.findOne({ _id: parentId, schoolId, isDeleted: false });
  if (!parent) throw new ApiError(404, 'Parent not found');

  const { name, phone, email, occupation, address, children } = updates;

  if (name || phone || email) {
    await User.findByIdAndUpdate(parent.userId, {
      $set: { ...(name && { name }), ...(phone && { phone }), ...(email && { email }) },
    }, { runValidators: true });
  }

  if (occupation !== undefined) parent.occupation = occupation;
  if (address !== undefined) parent.address = address;
  if (children !== undefined) parent.children = children;

  await parent.save();
  return parent.populate('userId', 'name phone email');
};

const deleteParent = async (parentId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const parent = await Parent.findOne({ _id: parentId, schoolId, isDeleted: false });
  if (!parent) throw new ApiError(404, 'Parent not found');

  parent.isDeleted = true;
  parent.deletedAt = new Date();
  await parent.save({ validateBeforeSave: false });

  await User.findByIdAndUpdate(parent.userId, { isDeleted: true, deletedAt: new Date(), isActive: false });
};

const getChildren = async (parentId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'parent']);

  if (requester.role === 'parent') {
    const parentScope = await getParentScope(requester.userId, schoolId);
    ensureParentProfileAccess(parentId, parentScope);
  }

  const parent = await Parent.findOne({ _id: parentId, schoolId, isDeleted: false });
  if (!parent) throw new ApiError(404, 'Parent not found');

  const filter = { _id: { $in: parent.children }, schoolId, isDeleted: false };

  const students = await Student.find(filter)
    .populate('userId', 'name avatar')
    .populate('classId', 'name grade section');

  return students;
};

module.exports = {
  listParents,
  getParentByUserId,
  getParentById,
  createParent,
  updateParent,
  deleteParent,
  getChildren,
};
