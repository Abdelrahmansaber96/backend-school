const Behavior = require('../models/Behavior.model');
const Parent = require('../models/Parent.model');
const Student = require('../models/Student.model');
const Class = require('../models/Class.model');
const ApiError = require('../utils/ApiError');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');
const {
  getParentScope,
  getStudentScope,
  getTeacherScope,
  ensureParentStudentAccess,
  ensureTeacherClassAccess,
  ensureTeacherStudentAccess,
} = require('../utils/accessScope');
const { assertRequesterRole } = require('../utils/authorization');
const { getCurrentHijriAcademicYear } = require('../utils/academicYear');

const linkUploadedFiles = async (attachments, schoolId, contextId) => {
  const fileIds = (attachments || [])
    .map((attachment) => attachment?.publicId)
    .filter(Boolean);

  if (!fileIds.length) return;

  const uploadService = require('./upload.service');
  await Promise.allSettled(
    fileIds.map((publicId) => uploadService.linkFile(publicId, contextId, schoolId)),
  );
};

const resolveBehaviorTeacherId = async (classId, schoolId, requester = {}) => {
  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    ensureTeacherClassAccess(classId, scope);
    return scope.teacherId;
  }

  const cls = await Class.findOne({ _id: classId, schoolId, isDeleted: false }).select('teacherId');
  if (!cls) throw new ApiError(404, 'Class not found');
  if (!cls.teacherId) throw new ApiError(400, 'Class must have an assigned teacher');
  return cls.teacherId;
};

const listBehavior = async (query, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher', 'parent', 'student', 'administrative']);

  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['createdAt']);
  const filter = { isDeleted: false };
  if (schoolId) filter.schoolId = schoolId;

  if (query.studentId) filter.studentId = query.studentId;
  if (query.classId) filter.classId = query.classId;
  if (query.type) filter.type = query.type;
  if (query.teacherId) filter.teacherId = query.teacherId;
  if (query.academicYear) filter.academicYear = query.academicYear;

  if (requester.role === 'parent') {
    const parentScope = await getParentScope(requester.userId, schoolId);
    if (query.studentId) {
      await ensureParentStudentAccess(query.studentId, schoolId, parentScope);
      filter.studentId = query.studentId;
    } else {
      filter.studentId = { $in: parentScope.childIds };
    }
  }

  if (requester.role === 'teacher') {
    const teacherScope = await getTeacherScope(requester.userId, schoolId);
    if (query.classId) {
      ensureTeacherClassAccess(query.classId, teacherScope);
      filter.classId = query.classId;
    } else {
      filter.classId = { $in: teacherScope.classIds };
    }

    if (query.studentId) {
      await ensureTeacherStudentAccess(query.studentId, schoolId, teacherScope);
      filter.studentId = query.studentId;
    }
  }

  if (requester.role === 'student') {
    const studentScope = await getStudentScope(requester.userId, schoolId);
    if (query.studentId && String(query.studentId) !== studentScope.studentId) {
      throw new ApiError(403, 'You can only access your own behavior records');
    }

    if (query.classId && studentScope.classId && String(query.classId) !== studentScope.classId) {
      throw new ApiError(403, 'Access denied for this class');
    }

    filter.studentId = studentScope.studentId;
  }

  const [records, total] = await Promise.all([
    Behavior.find(filter)
      .populate('studentId', 'userId nationalId')
      .populate('teacherId', 'userId')
      .populate('classId', 'name grade')
      .skip(skip).limit(limit).sort(sort),
    Behavior.countDocuments(filter),
  ]);

  return {
    data: records,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt'],
    }),
  };
};

const getBehaviorById = async (id, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher', 'parent', 'student', 'administrative']);

  const filter = { _id: id, schoolId, isDeleted: false };

  if (requester.role === 'parent') {
    const parentScope = await getParentScope(requester.userId, schoolId);
    filter.studentId = { $in: parentScope.childIds };
  }

  if (requester.role === 'teacher') {
    const teacherScope = await getTeacherScope(requester.userId, schoolId);
    filter.classId = { $in: teacherScope.classIds };
  }

  if (requester.role === 'student') {
    const studentScope = await getStudentScope(requester.userId, schoolId);
    filter.studentId = studentScope.studentId;
  }

  const record = await Behavior.findOne(filter)
    .populate('studentId', 'userId nationalId')
    .populate('teacherId', 'userId')
    .populate('classId', 'name grade');
  if (!record) throw new ApiError(404, 'Behavior record not found');
  return record;
};

const createBehavior = async (data, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'teacher', 'administrative']);

  const { studentId, classId, type, category, description, attachments, notifyParent } = data;
  const normalizedCategory = category?.trim() || null;

  // Ensure student belongs to the school
  const [student, teacherId] = await Promise.all([
    Student.findOne({ _id: studentId, schoolId, classId, isDeleted: false }),
    resolveBehaviorTeacherId(classId, schoolId, requester),
  ]);
  if (!student) throw new ApiError(404, 'Student not found in this school');

  const behavior = await Behavior.create({
    schoolId, studentId, teacherId, classId, type, category: normalizedCategory, description,
    attachments, notifyParent,
    academicYear: getCurrentHijriAcademicYear(),
  });

  await linkUploadedFiles(attachments, schoolId, behavior._id);

  // Trigger parent notification if requested (done via notification service asynchronously)
  if (notifyParent && student.parentId) {
    setImmediate(async () => {
      try {
        const notifService = require('./notification.service');
        await notifService.createNotification({
          schoolId,
          userId: null, // will look up parent's userId
          parentId: student.parentId,
          type: 'behavior',
          title: type === 'positive' ? 'Positive Behavior Recorded' : 'Behavior Incident Reported',
          body: description.slice(0, 150),
          data: { entityType: 'behaviors', entityId: behavior._id },
          deliveryMethod: ['in_app', 'email'],
        });
      } catch (_) { /* silent */ }
    });
  }

  return behavior;
};

const updateBehavior = async (id, schoolId, requester = {}, updates) => {
  assertRequesterRole(requester, ['school_admin', 'teacher', 'administrative']);

  const record = await Behavior.findOne({ _id: id, schoolId, isDeleted: false });
  if (!record) throw new ApiError(404, 'Behavior record not found');

  // Only the author or admin can edit
  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    await ensureTeacherStudentAccess(record.studentId, schoolId, scope);
    if (String(record.teacherId) !== String(scope.teacherId)) {
      throw new ApiError(403, 'You can only edit your own behavior records');
    }
  }

  const normalizedUpdates = {
    ...updates,
    category: updates.category === undefined ? updates.category : updates.category?.trim() || null,
  };

  Object.assign(record, normalizedUpdates);
  await record.save();

  if (normalizedUpdates.attachments) {
    await linkUploadedFiles(normalizedUpdates.attachments, schoolId, record._id);
  }

  return record;
};

const deleteBehavior = async (id, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'administrative']);

  const record = await Behavior.findOne({ _id: id, schoolId, isDeleted: false });
  if (!record) throw new ApiError(404, 'Behavior record not found');

  record.isDeleted = true;
  record.deletedAt = new Date();
  await record.save({ validateBeforeSave: false });
};

module.exports = { listBehavior, getBehaviorById, createBehavior, updateBehavior, deleteBehavior };
