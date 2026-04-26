const Class = require('../models/Class.model');
const Parent = require('../models/Parent.model');
const Student = require('../models/Student.model');
const Teacher = require('../models/Teacher.model');
const ApiError = require('./ApiError');

const uniqueIds = (values = []) => [...new Set(values.filter(Boolean).map((value) => String(value)))];

const getTeacherScope = async (userId, schoolId) => {
  const teacher = await Teacher.findOne({ userId, schoolId, isDeleted: false }).select('_id classes');
  if (!teacher) throw new ApiError(404, 'Teacher profile not found');

  const orFilters = [{ teacherId: teacher._id }];
  if (teacher.classes?.length) {
    orFilters.push({ _id: { $in: teacher.classes } });
  }

  const classes = await Class.find({ schoolId, isDeleted: false, $or: orFilters }).select('_id').lean();
  const classIds = uniqueIds([...(teacher.classes || []), ...classes.map((cls) => cls._id)]);

  return { teacherId: teacher._id, classIds };
};

const getTeacherAssignmentScope = async (userId, schoolId) => {
  const teacher = await Teacher.findOne({ userId, schoolId, isDeleted: false }).select('_id classes subjects');
  if (!teacher) throw new ApiError(404, 'Teacher profile not found');

  const orFilters = [{ teacherId: teacher._id }];
  if (teacher.classes?.length) {
    orFilters.push({ _id: { $in: teacher.classes } });
  }

  const classes = await Class.find({ schoolId, isDeleted: false, $or: orFilters }).select('_id').lean();
  const classIds = uniqueIds([...(teacher.classes || []), ...classes.map((cls) => cls._id)]);

  return {
    teacherId: String(teacher._id),
    classIds,
    subjectIds: uniqueIds(teacher.subjects || []),
  };
};

const getParentScope = async (userId, schoolId) => {
  const parent = await Parent.findOne({ userId, schoolId, isDeleted: false }).select('_id children');
  if (!parent) throw new ApiError(404, 'Parent profile not found');

  return {
    parentId: parent._id,
    childIds: uniqueIds(parent.children || []),
  };
};

const getStudentScope = async (userId, schoolId) => {
  const student = await Student.findOne({ userId, schoolId, isDeleted: false }).select('_id classId parentId');
  if (!student) throw new ApiError(404, 'Student profile not found');

  return {
    studentId: String(student._id),
    classId: student.classId ? String(student.classId) : null,
    parentId: student.parentId ? String(student.parentId) : null,
  };
};

const ensureTeacherClassAccess = (classId, scope) => {
  if (!scope.classIds.includes(String(classId))) {
    throw new ApiError(403, 'Access denied for this class');
  }
};

const ensureTeacherStudentAccess = async (studentId, schoolId, scope) => {
  const student = await Student.findOne({ _id: studentId, schoolId, isDeleted: false }).select('_id classId parentId');
  if (!student) throw new ApiError(404, 'Student not found');

  ensureTeacherClassAccess(student.classId, scope);
  return student;
};

const getTeacherParentIds = async (schoolId, scope) => {
  if (!scope.classIds.length) return [];

  const students = await Student.find({ schoolId, classId: { $in: scope.classIds }, isDeleted: false })
    .select('parentId')
    .lean();

  return uniqueIds(students.map((student) => student.parentId));
};

const ensureParentProfileAccess = (parentId, scope) => {
  if (String(parentId) !== String(scope.parentId)) {
    throw new ApiError(403, 'You can only access your own parent profile');
  }
};

const ensureParentStudentAccess = async (studentId, schoolId, scope) => {
  const student = await Student.findOne({ _id: studentId, schoolId, isDeleted: false }).select('_id parentId classId');
  if (!student) throw new ApiError(404, 'Student not found');

  if (!scope.childIds.includes(String(student._id)) || String(student.parentId) !== String(scope.parentId)) {
    throw new ApiError(403, 'Access denied for this student');
  }

  return student;
};

const ensureStudentSelfAccess = (studentId, scope) => {
  if (String(studentId) !== String(scope.studentId)) {
    throw new ApiError(403, 'You can only access your own student profile');
  }
};

const ensureStudentClassAccess = (classId, scope) => {
  if (scope.classId && String(classId) !== String(scope.classId)) {
    throw new ApiError(403, 'Access denied for this class');
  }
};

const ensureSchoolReference = async (Model, id, schoolId, label) => {
  if (!id) return null;

  const doc = await Model.findOne({ _id: id, schoolId, isDeleted: false }).select('_id');
  if (!doc) throw new ApiError(404, `${label} not found in this school`);
  return doc;
};

const ensureSchoolReferences = async (Model, ids, schoolId, label) => {
  if (!Array.isArray(ids) || !ids.length) return [];

  const unique = uniqueIds(ids);
  const docs = await Model.find({ _id: { $in: unique }, schoolId, isDeleted: false }).select('_id').lean();
  if (docs.length !== unique.length) {
    throw new ApiError(404, `One or more ${label} not found in this school`);
  }

  return docs;
};

module.exports = {
  getTeacherScope,
  getTeacherAssignmentScope,
  getParentScope,
  getStudentScope,
  ensureTeacherClassAccess,
  ensureTeacherStudentAccess,
  getTeacherParentIds,
  ensureParentProfileAccess,
  ensureParentStudentAccess,
  ensureStudentSelfAccess,
  ensureStudentClassAccess,
  ensureSchoolReference,
  ensureSchoolReferences,
};