const Teacher = require('../models/Teacher.model');
const Subject = require('../models/Subject.model');
const Class = require('../models/Class.model');
const User = require('../models/User.model');
const ApiError = require('../utils/ApiError');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');
const { getTeacherScope, ensureSchoolReferences } = require('../utils/accessScope');
const { assertRequesterRole } = require('../utils/authorization');

/**
 * List teachers for a school
 */
const listTeachers = async (query, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin']);

  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['createdAt', 'joinDate']);

  const filter = { isDeleted: false };
  if (schoolId) filter.schoolId = schoolId;
  if (query.search) {
    // Search on the joined User documents – we'll populate first or use lookup
    // For simplicity, search by nationalId on Teacher directly
    filter.nationalId = { $regex: query.search, $options: 'i' };
  }

  const [teachers, total] = await Promise.all([
    Teacher.find(filter)
      .populate('userId', 'name phone email avatar isActive lastLogin')
      .populate('subjects', 'name code')
      .populate('classes', 'name grade section')
      .skip(skip).limit(limit).sort(sort),
    Teacher.countDocuments(filter),
  ]);

  return {
    data: teachers,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt', 'joinDate'],
    }),
  };
};

/**
 * Get a single teacher
 */
const getTeacherById = async (teacherId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher']);

  const filter = { _id: teacherId, schoolId, isDeleted: false };

  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    filter._id = scope.teacherId;
  }

  const teacher = await Teacher.findOne(filter)
    .populate('userId', 'name phone email avatar isActive mustChangePassword')
    .populate('subjects', 'name code')
    .populate('classes', 'name grade section academicYear');
  if (!teacher) throw new ApiError(404, 'Teacher not found');
  return teacher;
};

/**
 * Create a teacher (also creates their User account)
 */
const createTeacher = async (data, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const { nationalId, name, phone, email, specialization, subjects, classes, joinDate } = data;

  const existingUser = await User.findOne({
    $or: [{ nationalId }, { phone }], isDeleted: false,
  });
  if (existingUser) throw new ApiError(409, 'National ID or phone already in use');

  await Promise.all([
    ensureSchoolReferences(Subject, subjects, schoolId, 'subjects'),
    ensureSchoolReferences(Class, classes, schoolId, 'classes'),
  ]);

  const tempPassword = `Teacher@${nationalId.slice(-4)}`;

  const user = await User.create({
    schoolId, role: 'teacher', nationalId, phone, email,
    password: tempPassword,
    name, mustChangePassword: true,
  });

  const teacher = await Teacher.create({
    userId: user._id, schoolId, nationalId, specialization, subjects, classes, joinDate,
  });

  return { teacher, tempPassword };
};

/**
 * Update teacher profile
 */
const updateTeacher = async (teacherId, schoolId, updates, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const teacher = await Teacher.findOne({ _id: teacherId, schoolId, isDeleted: false });
  if (!teacher) throw new ApiError(404, 'Teacher not found');

  const { name, phone, email, specialization, subjects, classes, joinDate } = updates;

  // Update User fields if provided
  if (name || phone || email) {
    await User.findByIdAndUpdate(teacher.userId, {
      $set: { ...(name && { name }), ...(phone && { phone }), ...(email && { email }) },
    }, { runValidators: true });
  }

  // Update Teacher fields
  const teacherUpdates = {};
  if (specialization !== undefined) teacherUpdates.specialization = specialization;
  if (subjects !== undefined) {
    await ensureSchoolReferences(Subject, subjects, schoolId, 'subjects');
    teacherUpdates.subjects = subjects;
  }
  if (classes !== undefined) {
    await ensureSchoolReferences(Class, classes, schoolId, 'classes');
    teacherUpdates.classes = classes;
  }
  if (joinDate !== undefined) teacherUpdates.joinDate = joinDate;

  if (Object.keys(teacherUpdates).length > 0) {
    Object.assign(teacher, teacherUpdates);
    await teacher.save();
  }

  return teacher.populate('userId', 'name phone email');
};

/**
 * Soft-delete a teacher
 */
const deleteTeacher = async (teacherId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const teacher = await Teacher.findOne({ _id: teacherId, schoolId, isDeleted: false });
  if (!teacher) throw new ApiError(404, 'Teacher not found');

  teacher.isDeleted = true;
  teacher.deletedAt = new Date();
  await teacher.save({ validateBeforeSave: false });

  await User.findByIdAndUpdate(teacher.userId, {
    isDeleted: true, deletedAt: new Date(), isActive: false,
  });
};

module.exports = { listTeachers, getTeacherById, createTeacher, updateTeacher, deleteTeacher };
