const Subject = require('../models/Subject.model');
const ApiError = require('../utils/ApiError');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');
const { assertRequesterRole } = require('../utils/authorization');
const { getTeacherAssignmentScope } = require('../utils/accessScope');

const listSubjects = async (query, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher']);

  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['name', 'code', 'createdAt']);
  const filter = { isDeleted: false };
  if (schoolId) filter.schoolId = schoolId;

  if (requester.role === 'teacher') {
    const scope = await getTeacherAssignmentScope(requester.userId, schoolId);
    filter._id = { $in: scope.subjectIds };
  }

  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.search) {
    filter.$or = [
      { name: { $regex: query.search, $options: 'i' } },
      { code: { $regex: query.search, $options: 'i' } },
    ];
  }

  const [subjects, total] = await Promise.all([
    Subject.find(filter).skip(skip).limit(limit).sort(sort),
    Subject.countDocuments(filter),
  ]);

  return {
    data: subjects,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['name', 'code', 'createdAt'],
      defaultSortField: 'createdAt',
    }),
  };
};

const getSubjectById = async (subjectId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher']);

  if (requester.role === 'teacher') {
    const scope = await getTeacherAssignmentScope(requester.userId, schoolId);
    if (!scope.subjectIds.includes(String(subjectId))) {
      throw new ApiError(404, 'Subject not found');
    }
  }

  const subject = await Subject.findOne({ _id: subjectId, schoolId, isDeleted: false });
  if (!subject) throw new ApiError(404, 'Subject not found');
  return subject;
};

const createSubject = async (data, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const { name, nameAr, code } = data;

  const existing = await Subject.findOne({ schoolId, name: { $regex: `^${name}$`, $options: 'i' }, isDeleted: false });
  if (existing) throw new ApiError(409, `Subject "${name}" already exists`);

  return Subject.create({ schoolId, name, nameAr, code: code ? code.toUpperCase() : undefined });
};

const updateSubject = async (subjectId, schoolId, updates, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  if (updates.code) updates.code = updates.code.toUpperCase();
  const subject = await Subject.findOneAndUpdate(
    { _id: subjectId, schoolId, isDeleted: false },
    { $set: updates },
    { new: true, runValidators: true },
  );
  if (!subject) throw new ApiError(404, 'Subject not found');
  return subject;
};

const deleteSubject = async (subjectId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const subject = await Subject.findOneAndUpdate(
    { _id: subjectId, schoolId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  );
  if (!subject) throw new ApiError(404, 'Subject not found');
};

module.exports = { listSubjects, getSubjectById, createSubject, updateSubject, deleteSubject };
