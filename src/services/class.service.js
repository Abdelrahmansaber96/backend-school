const Class = require('../models/Class.model');
const Student = require('../models/Student.model');
const Teacher = require('../models/Teacher.model');
const ApiError = require('../utils/ApiError');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');
const { getTeacherScope, ensureTeacherClassAccess, ensureSchoolReference } = require('../utils/accessScope');
const { assertRequesterRole } = require('../utils/authorization');

const listClasses = async (query, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher']);

  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['createdAt', 'name', 'grade']);
  const filter = { isDeleted: false };
  if (schoolId) filter.schoolId = schoolId;

  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    filter._id = { $in: scope.classIds };
  }

  if (query.academicYear) filter.academicYear = query.academicYear;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.search) filter.name = { $regex: query.search, $options: 'i' };

  const [classes, total] = await Promise.all([
    Class.find(filter)
      .populate('teacherId', 'userId')
      .skip(skip).limit(limit).sort(sort),
    Class.countDocuments(filter),
  ]);

  return {
    data: classes,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt', 'name', 'grade'],
    }),
  };
};

const getClassById = async (classId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher']);

  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    ensureTeacherClassAccess(classId, scope);
  }

  const cls = await Class.findOne({ _id: classId, schoolId, isDeleted: false })
    .populate({ path: 'teacherId', populate: { path: 'userId', select: 'name phone' } });
  if (!cls) throw new ApiError(404, 'Class not found');
  return cls;
};

const createClass = async (data, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const { name, grade, section, academicYear, teacherId, capacity } = data;

  const existing = await Class.findOne({ schoolId, name, academicYear, isDeleted: false });
  if (existing) throw new ApiError(409, `Class "${name}" already exists for ${academicYear}`);

  if (teacherId) {
    await ensureSchoolReference(Teacher, teacherId, schoolId, 'Teacher');
  }

  const cls = await Class.create({ schoolId, name, grade, section, academicYear, teacherId, capacity });
  return cls;
};

const updateClass = async (classId, schoolId, updates, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  if (updates.teacherId !== undefined && updates.teacherId !== null) {
    await ensureSchoolReference(Teacher, updates.teacherId, schoolId, 'Teacher');
  }

  const cls = await Class.findOneAndUpdate(
    { _id: classId, schoolId, isDeleted: false },
    { $set: updates },
    { new: true, runValidators: true },
  );
  if (!cls) throw new ApiError(404, 'Class not found');
  return cls;
};

const deleteClass = async (classId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const cls = await Class.findOne({ _id: classId, schoolId, isDeleted: false });
  if (!cls) throw new ApiError(404, 'Class not found');

  const studentCount = await Student.countDocuments({ classId, isDeleted: false });
  if (studentCount > 0) {
    throw new ApiError(400, `Cannot delete class with ${studentCount} active student(s). Reassign them first.`);
  }

  cls.isDeleted = true;
  cls.deletedAt = new Date();
  await cls.save({ validateBeforeSave: false });
};

const getClassStudents = async (classId, schoolId, query, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher']);

  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    ensureTeacherClassAccess(classId, scope);
  }

  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['createdAt']);

  const filter = { classId, schoolId, isDeleted: false };
  const [students, total] = await Promise.all([
    Student.find(filter)
      .populate('userId', 'name avatar phone')
      .skip(skip).limit(limit).sort(sort),
    Student.countDocuments(filter),
  ]);

  return {
    data: students,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt'],
    }),
  };
};

module.exports = { listClasses, getClassById, createClass, updateClass, deleteClass, getClassStudents };
