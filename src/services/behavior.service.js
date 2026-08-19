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
const notificationTemplates = require('../utils/notificationTemplates');

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

const resolveBehaviorTeacherIdForClass = (cls, requester = {}) => {
  if (!cls) throw new ApiError(404, 'Class not found');

  if (cls.teacherId) {
    return cls.teacherId;
  }

  if (requester.role === 'school_admin' || requester.role === 'administrative') {
    return null;
  }

  throw new ApiError(400, 'Class must have an assigned teacher');
};

const resolveBehaviorTeacherId = async (classId, schoolId, requester = {}) => {
  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    ensureTeacherClassAccess(classId, scope);
    return scope.teacherId;
  }

  const cls = await Class.findOne({ _id: classId, schoolId, isDeleted: false }).select('teacherId');
  return resolveBehaviorTeacherIdForClass(cls, requester);
};

const applyBehaviorRecordPopulation = (query) => query
  .populate({
    path: 'studentId',
    select: 'userId nationalId',
    populate: { path: 'userId', select: 'name' },
  })
  .populate({
    path: 'teacherId',
    select: 'userId',
    populate: { path: 'userId', select: 'name' },
  })
  .populate('classId', 'name grade');

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
  if (query.category) filter.category = query.category;
  if (query.academicYear) filter.academicYear = query.academicYear;
  if (query.grade && !query.classId) {
    const classIds = await Class.distinct('_id', { schoolId, grade: String(query.grade), isDeleted: false });
    filter.classId = { $in: classIds };
  }
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate); end.setHours(23, 59, 59, 999); filter.createdAt.$lte = end;
    }
  }

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
      const requestedIds = filter.classId?.$in?.map(String);
      filter.classId = { $in: requestedIds
        ? teacherScope.classIds.filter((id) => requestedIds.includes(String(id)))
        : teacherScope.classIds };
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
    applyBehaviorRecordPopulation(
      Behavior.find(filter)
        .skip(skip).limit(limit).sort(sort),
    ),
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

  const record = await applyBehaviorRecordPopulation(Behavior.findOne(filter));
  if (!record) throw new ApiError(404, 'Behavior record not found');
  return record;
};

const createBehavior = async (data, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'teacher', 'administrative']);

  const { studentId, classId, type, category, description, attachments, notifyParent } = data;
  const normalizedCategory = category?.trim() || null;

  // Ensure student belongs to the school
  const [student, teacherId] = await Promise.all([
    Student.findOne({ _id: studentId, schoolId, classId, isDeleted: false }).populate('userId', 'name'),
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
        const localized = notificationTemplates.behavior({
          positive: type === 'positive',
          studentName: [student.userId?.name?.first, student.userId?.name?.last].filter(Boolean).join(' '),
          description,
        });
        await notifService.createNotification({
          schoolId,
          userId: null, // will look up parent's userId
          parentId: student.parentId,
          type: 'behavior',
          title: localized.title,
          body: localized.body,
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

module.exports = {
  listBehavior,
  getBehaviorById,
  createBehavior,
  updateBehavior,
  deleteBehavior,
  __testables: {
    resolveBehaviorTeacherIdForClass,
  },
};
