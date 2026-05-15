const Attendance = require('../models/Attendance.model');
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
  ensureStudentClassAccess,
  ensureStudentSelfAccess,
  ensureTeacherClassAccess,
  ensureTeacherStudentAccess,
} = require('../utils/accessScope');
const { assertRequesterRole } = require('../utils/authorization');
const { queueSocketEvent } = require('../sockets/socket.emitter');
const { socketRooms, SOCKET_EVENTS } = require('../sockets/socket.contract');
const { toObjectId, toObjectIdMatch } = require('../utils/mongo');
const { getCurrentHijriAcademicYear } = require('../utils/academicYear');

const EMPTY_ATTENDANCE_SUMMARY = { total: 0, absence: 0, late: 0, permission: 0 };

const normalizeBulkAttendanceRecords = ({ studentIds, records, type, notes }) => {
  if (Array.isArray(records) && records.length) {
    return records;
  }

  if (Array.isArray(studentIds) && studentIds.length) {
    return studentIds.map((studentId) => ({ studentId, type, notes }));
  }

  return [];
};

const resolveAttendanceTeacherId = async (classId, schoolId, requester = {}) => {
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

const applyAttendanceRecordPopulation = (query) => query
  .populate({
    path: 'studentId',
    select: 'userId nationalId',
    populate: { path: 'userId', select: 'name' },
  })
  .populate('teacherId', 'userId');

const applyOwnershipFilter = async (filter, schoolId, requester = {}, requestedStudentId, requestedClassId) => {
  if (requester.role === 'parent') {
    const parentScope = await getParentScope(requester.userId, schoolId);
    if (requestedStudentId) {
      await ensureParentStudentAccess(requestedStudentId, schoolId, parentScope);
      filter.studentId = requestedStudentId;
    } else {
      filter.studentId = { $in: parentScope.childIds };
    }
    return;
  }

  if (requester.role === 'teacher') {
    const teacherScope = await getTeacherScope(requester.userId, schoolId);
    if (requestedClassId) {
      ensureTeacherClassAccess(requestedClassId, teacherScope);
      filter.classId = requestedClassId;
    } else {
      filter.classId = { $in: teacherScope.classIds };
    }

    if (requestedStudentId) {
      await ensureTeacherStudentAccess(requestedStudentId, schoolId, teacherScope);
      filter.studentId = requestedStudentId;
    }

    return;
  }

  if (requester.role === 'student') {
    const studentScope = await getStudentScope(requester.userId, schoolId);

    if (requestedStudentId) {
      ensureStudentSelfAccess(requestedStudentId, studentScope);
    }

    if (requestedClassId) {
      ensureStudentClassAccess(requestedClassId, studentScope);
      filter.classId = requestedClassId;
    }

    filter.studentId = studentScope.studentId;
  }
};

const formatStudentName = (student) => {
  const first = student?.userId?.name?.first;
  const last = student?.userId?.name?.last;
  return [first, last].filter(Boolean).join(' ').trim();
};

const buildAttendanceSocketPayload = (record, student) => ({
  _id: String(record._id),
  schoolId: String(record.schoolId),
  studentId: String(record.studentId),
  studentName: formatStudentName(student),
  classId: String(record.classId),
  teacherId: String(record.teacherId),
  type: record.type,
  date: new Date(record.date).toISOString(),
  notes: record.notes || null,
  createdAt: record.createdAt ? new Date(record.createdAt).toISOString() : new Date().toISOString(),
});

const emitAttendanceCreatedEvents = async (records, schoolId) => {
  const normalizedRecords = (Array.isArray(records) ? records : [records]).filter(Boolean);
  if (!normalizedRecords.length) return;

  const studentIds = [...new Set(normalizedRecords.map((record) => String(record.studentId)).filter(Boolean))];
  if (!studentIds.length) return;

  const students = await Student.find({
    _id: { $in: studentIds },
    schoolId,
    isDeleted: false,
  })
    .populate('userId', 'name')
    .select('_id userId parentId')
    .lean();

  const parentIds = [...new Set(students.map((student) => String(student.parentId)).filter(Boolean))];
  if (!parentIds.length) return;

  const parents = await Parent.find({
    _id: { $in: parentIds },
    schoolId,
    isDeleted: false,
  })
    .select('_id userId')
    .lean();

  const studentsById = new Map(students.map((student) => [String(student._id), student]));
  const parentsById = new Map(parents.map((parent) => [String(parent._id), parent]));
  const notificationService = require('./notification.service');

  const notificationTasks = normalizedRecords.map(async (record) => {
    const student = studentsById.get(String(record.studentId));
    const parentUserId = student ? parentsById.get(String(student.parentId))?.userId : null;
    if (!parentUserId || !student) return;

    queueSocketEvent({
      room: socketRooms.user(parentUserId),
      eventName: SOCKET_EVENTS.ATTENDANCE_CREATED,
      payload: buildAttendanceSocketPayload(record, student),
    });

    await notificationService.createNotification({
      schoolId,
      userId: parentUserId,
      type: 'attendance',
      title: record.type === 'absence'
        ? 'Attendance absence recorded'
        : record.type === 'late'
          ? 'Student marked late'
          : 'Attendance permission recorded',
      body: `${formatStudentName(student) || 'Student'} has a new attendance update for ${new Date(record.date).toLocaleDateString('en-GB')}.`,
      data: {
        entityType: 'attendance',
        entityId: record._id,
        extra: {
          studentId: String(record.studentId),
          studentName: formatStudentName(student),
          classId: String(record.classId),
          type: record.type,
        },
      },
      deliveryMethod: ['in_app', 'email'],
    });
  });

  await Promise.allSettled(notificationTasks);
};

const scheduleAttendanceCreatedEvents = (records, schoolId) => {
  setImmediate(async () => {
    try {
      await emitAttendanceCreatedEvents(records, schoolId);
    } catch (_) { /* silent */ }
  });
};

/**
 * Create a single attendance record
 */
const createAttendance = async (data, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'teacher', 'administrative']);

  const { studentId, classId, type, date, notes } = data;

  const [student, teacherId] = await Promise.all([
    Student.findOne({ _id: studentId, classId, schoolId, isDeleted: false }),
    resolveAttendanceTeacherId(classId, schoolId, requester),
  ]);
  if (!student) throw new ApiError(404, 'Student not found in this class');

  // Check for duplicate (unique index will catch it, but give a nicer message)
  const existing = await Attendance.findOne({ schoolId, studentId, date: new Date(date), isDeleted: false });
  if (existing) throw new ApiError(409, 'Attendance record already exists for this student on this date');

  const record = await Attendance.create({
    schoolId, studentId, classId, teacherId, type, date: new Date(date), notes,
    academicYear: getCurrentHijriAcademicYear(new Date(date)),
  });

  scheduleAttendanceCreatedEvents(record, schoolId);
  return record;
};

/**
 * Bulk-create attendance for an entire class on one date
 */
const bulkCreateAttendance = async (payload, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'teacher', 'administrative']);

  const { classId, date } = payload;
  const attendanceDate = new Date(date);
  const teacherId = await resolveAttendanceTeacherId(classId, schoolId, requester);
  const normalizedRecords = normalizeBulkAttendanceRecords(payload);

  if (!normalizedRecords.length) {
    throw new ApiError(400, 'At least one attendance record is required');
  }

  const studentIds = normalizedRecords.map((record) => record.studentId);
  const studentCount = await Student.countDocuments({ _id: { $in: studentIds }, classId, schoolId, isDeleted: false });
  if (studentCount !== studentIds.length) {
    throw new ApiError(400, 'One or more students do not belong to this class');
  }

  // Remove any existing records for this class on this date first
  await Attendance.updateMany(
    { schoolId, classId, date: attendanceDate, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
  );

  const docs = normalizedRecords.map(({ studentId, type, notes }) => ({
    schoolId, studentId, classId, teacherId, type, date: attendanceDate,
    notes, academicYear: getCurrentHijriAcademicYear(attendanceDate),
  }));

  const records = await Attendance.insertMany(docs, { ordered: false });
  scheduleAttendanceCreatedEvents(records, schoolId);
  return records;
};

/**
 * Update a single attendance record
 */
const updateAttendance = async (attendanceId, updates, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'teacher', 'administrative']);

  const record = await Attendance.findOne({ _id: attendanceId, schoolId, isDeleted: false });
  if (!record) throw new ApiError(404, 'Attendance record not found');

  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    ensureTeacherClassAccess(record.classId, scope);
    if (String(record.teacherId) !== String(scope.teacherId)) {
      throw new ApiError(403, 'You can only update your own attendance records');
    }
  }

  Object.assign(record, updates);
  await record.save();
  return record;
};

/**
 * Soft-delete a single attendance record
 */
const deleteAttendance = async (attendanceId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'administrative']);

  const record = await Attendance.findOneAndUpdate(
    { _id: attendanceId, schoolId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
  );
  if (!record) throw new ApiError(404, 'Attendance record not found');
};

/**
 * Get attendance records with optional filters
 */
const getAttendance = async (query, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher', 'parent', 'student', 'administrative']);

  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['date', 'createdAt', 'type'], 'date');
  const filter = { isDeleted: false };
  if (schoolId) filter.schoolId = schoolId;

  if (query.studentId) filter.studentId = query.studentId;
  if (query.classId) filter.classId = query.classId;
  if (query.type) filter.type = query.type;
  if (query.startDate || query.endDate) {
    filter.date = {};
    if (query.startDate) filter.date.$gte = new Date(query.startDate);
    if (query.endDate) filter.date.$lte = new Date(query.endDate);
  }

  await applyOwnershipFilter(filter, schoolId, requester, query.studentId, query.classId);

  const [records, total] = await Promise.all([
    applyAttendanceRecordPopulation(
      Attendance.find(filter)
        .skip(skip).limit(limit).sort(sort),
    ).lean(),
    Attendance.countDocuments(filter),
  ]);

  return {
    data: records,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['date', 'createdAt', 'type'],
      defaultSortField: 'date',
    }),
  };
};

/**
 * Summarize attendance stats for a student in a date range
 */
const getStudentSummary = async (studentId, schoolId, { startDate, endDate, academicYear }, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher', 'parent', 'student', 'administrative']);

  const filter = { schoolId, studentId, isDeleted: false };

  await applyOwnershipFilter(filter, schoolId, requester, studentId, null);

  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }
  if (academicYear) filter.academicYear = String(academicYear);

  const match = { isDeleted: false };
  if (schoolId) match.schoolId = toObjectId(schoolId, 'schoolId');

  const studentIdMatch = toObjectIdMatch(filter.studentId, 'studentId');
  if (studentIdMatch !== undefined) match.studentId = studentIdMatch;

  const classIdMatch = toObjectIdMatch(filter.classId, 'classId');
  if (classIdMatch !== undefined) match.classId = classIdMatch;

  if (filter.date) match.date = filter.date;
  if (filter.academicYear) match.academicYear = filter.academicYear;

  const [summary] = await Attendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        absence: { $sum: { $cond: [{ $eq: ['$type', 'absence'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$type', 'late'] }, 1, 0] } },
        permission: { $sum: { $cond: [{ $eq: ['$type', 'permission'] }, 1, 0] } },
      },
    },
    { $project: { _id: 0, total: 1, absence: 1, late: 1, permission: 1 } },
  ]);

  return summary || EMPTY_ATTENDANCE_SUMMARY;
};

module.exports = {
  createAttendance, bulkCreateAttendance, updateAttendance,
  deleteAttendance, getAttendance, getStudentSummary,
};
