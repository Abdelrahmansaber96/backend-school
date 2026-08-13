const mongoose = require('mongoose');
const Attendance = require('../models/Attendance.model');
const Behavior = require('../models/Behavior.model');
const Class = require('../models/Class.model');
const Grade = require('../models/Grade.model');
const Notification = require('../models/Notification.model');
const Parent = require('../models/Parent.model');
const School = require('../models/School.model');
const Student = require('../models/Student.model');
const Teacher = require('../models/Teacher.model');
const User = require('../models/User.model');
const ApiError = require('../utils/ApiError');
const { getParentScope, getStudentScope, getTeacherScope } = require('../utils/accessScope');

const VALID_RANGES = new Set(['today', '7d', '30d']);
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const buildPeriod = (range = 'today', now = new Date()) => {
  const normalizedRange = VALID_RANGES.has(range) ? range : 'today';
  const days = normalizedRange === '30d' ? 30 : normalizedRange === '7d' ? 7 : 1;
  const end = endOfDay(now);
  const start = startOfDay(new Date(end.getTime() - ((days - 1) * DAY_MS)));
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = startOfDay(new Date(previousEnd.getTime() - ((days - 1) * DAY_MS)));
  return { range: normalizedRange, days, start, end, previousStart, previousEnd };
};

const comparison = (value, previousValue) => {
  const changePercent = previousValue === 0
    ? (value === 0 ? 0 : 100)
    : Math.round((((value - previousValue) / previousValue) * 100) * 10) / 10;
  return {
    value,
    previousValue,
    changePercent,
    direction: value === previousValue ? 'stable' : value > previousValue ? 'up' : 'down',
  };
};

const objectIds = (values = []) => values.map((value) => new mongoose.Types.ObjectId(String(value)));
const fullName = (user) => [user?.name?.first, user?.name?.last].filter(Boolean).join(' ');

const buildScope = async (schoolId, requester) => {
  if (requester.role !== 'super_admin' && !schoolId) throw new ApiError(403, 'Missing school context');

  const base = { isDeleted: false };
  if (schoolId) base.schoolId = new mongoose.Types.ObjectId(String(schoolId));

  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    return { ...base, classId: { $in: objectIds(scope.classIds) }, teacherId: scope.teacherId };
  }
  if (requester.role === 'parent') {
    const scope = await getParentScope(requester.userId, schoolId);
    const childIds = objectIds(scope.childIds);
    const classIds = await Student.distinct('classId', { _id: { $in: childIds }, schoolId, isDeleted: false });
    return { ...base, studentId: { $in: childIds }, classId: { $in: classIds.filter(Boolean) }, parentId: scope.parentId };
  }
  if (requester.role === 'student') {
    const scope = await getStudentScope(requester.userId, schoolId);
    return {
      ...base,
      studentId: new mongoose.Types.ObjectId(scope.studentId),
      classId: scope.classId ? new mongoose.Types.ObjectId(scope.classId) : null,
    };
  }
  return base;
};

const attendanceCounts = async (match, period) => {
  const rows = await Attendance.aggregate([
    { $match: { ...match, date: { $gte: period.previousStart, $lte: period.end } } },
    { $group: {
      _id: { type: '$type', current: { $gte: ['$date', period.start] } },
      count: { $sum: 1 },
    } },
  ]);
  const result = { current: { absence: 0, late: 0, permission: 0 }, previous: { absence: 0, late: 0, permission: 0 } };
  rows.forEach((row) => { result[row._id.current ? 'current' : 'previous'][row._id.type] = row.count; });
  return result;
};

const behaviorCounts = async (match, period) => {
  const rows = await Behavior.aggregate([
    { $match: { ...match, type: 'negative', createdAt: { $gte: period.previousStart, $lte: period.end } } },
    { $group: { _id: { $gte: ['$createdAt', period.start] }, count: { $sum: 1 } } },
  ]);
  return rows.reduce((acc, row) => ({ ...acc, [row._id ? 'current' : 'previous']: row.count }), { current: 0, previous: 0 });
};

const buildTrend = async (match, period) => {
  const trendStart = startOfDay(new Date(period.end.getTime() - (6 * DAY_MS)));
  const [attendance, behavior] = await Promise.all([
    Attendance.aggregate([
      { $match: { ...match, date: { $gte: trendStart, $lte: period.end } } },
      { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, type: '$type' }, count: { $sum: 1 } } },
    ]),
    Behavior.aggregate([
      { $match: { ...match, type: 'negative', createdAt: { $gte: trendStart, $lte: period.end } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
  ]);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(trendStart.getTime() + (index * DAY_MS)).toISOString().slice(0, 10);
    return { date, absences: 0, lates: 0, permissions: 0, negativeBehaviors: 0 };
  });
  const byDate = new Map(days.map((day) => [day.date, day]));
  attendance.forEach(({ _id, count }) => {
    const row = byDate.get(_id.date);
    if (row) row[_id.type === 'absence' ? 'absences' : _id.type === 'late' ? 'lates' : 'permissions'] = count;
  });
  behavior.forEach(({ _id, count }) => { const row = byDate.get(_id); if (row) row.negativeBehaviors = count; });
  return days;
};

const serializeStudent = (student) => student ? ({
  _id: String(student._id),
  name: fullName(student.userId) || 'طالب غير متاح',
  phone: student.userId?.phone || null,
  parentPhone: student.parentId?.userId?.phone || student.emergencyContacts?.[0]?.phone || null,
}) : ({ _id: '', name: 'طالب غير متاح', phone: null, parentPhone: null });

const serializeClass = (classroom) => classroom ? {
  _id: String(classroom._id), name: classroom.name, grade: classroom.grade, section: classroom.section || null,
} : null;

const buildAlerts = async (match, period, requester) => {
  const populate = [
    { path: 'studentId', select: 'userId parentId emergencyContacts', populate: [
      { path: 'userId', select: 'name phone' },
      { path: 'parentId', select: 'userId', populate: { path: 'userId', select: 'name phone' } },
    ] },
    { path: 'classId', select: 'name grade section' },
  ];
  const [attendance, behavior, notifications] = await Promise.all([
    Attendance.find({ ...match, date: { $gte: period.start, $lte: period.end } })
      .sort({ date: -1, createdAt: -1 }).limit(8).populate(populate).lean(),
    Behavior.find({ ...match, type: 'negative', createdAt: { $gte: period.start, $lte: period.end } })
      .sort({ createdAt: -1 }).limit(8).populate(populate).lean(),
    Notification.find({ userId: requester.userId, isRead: false }).sort({ createdAt: -1 }).limit(3).lean(),
  ]);
  return [
    ...attendance.map((item) => ({
      id: String(item._id), type: item.type, priority: item.type === 'absence' ? 'critical' : 'high',
      title: item.type === 'absence' ? 'غياب طالب' : item.type === 'late' ? 'تأخر طالب' : 'إذن طالب',
      description: item.notes || null, occurredAt: item.date, student: serializeStudent(item.studentId),
      class: serializeClass(item.classId), href: `/attendance?studentId=${item.studentId?._id || ''}`,
    })),
    ...behavior.map((item) => ({
      id: String(item._id), type: 'negative_behavior', priority: 'high', title: item.category || 'سلوك سلبي',
      description: item.description, occurredAt: item.createdAt, student: serializeStudent(item.studentId),
      class: serializeClass(item.classId), href: `/behavior?studentId=${item.studentId?._id || ''}`,
    })),
    ...notifications.map((item) => ({
      id: String(item._id), type: 'unread_notification', priority: 'medium', title: item.title,
      description: item.body, occurredAt: item.createdAt, student: null, class: null, href: '/notifications',
    })),
  ].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).slice(0, 8);
};

const buildAttention = async (match, period) => {
  const [attendance, behavior] = await Promise.all([
    Attendance.aggregate([
      { $match: { ...match, date: { $gte: period.start, $lte: period.end } } },
      { $group: { _id: '$studentId', absences: { $sum: { $cond: [{ $eq: ['$type', 'absence'] }, 1, 0] } }, lates: { $sum: { $cond: [{ $eq: ['$type', 'late'] }, 1, 0] } } } },
    ]),
    Behavior.aggregate([
      { $match: { ...match, type: 'negative', createdAt: { $gte: period.start, $lte: period.end } } },
      { $group: { _id: '$studentId', negativeBehaviors: { $sum: 1 } } },
    ]),
  ]);
  const scores = new Map();
  attendance.forEach((row) => scores.set(String(row._id), { absences: row.absences, lates: row.lates, negativeBehaviors: 0 }));
  behavior.forEach((row) => {
    const key = String(row._id); const current = scores.get(key) || { absences: 0, lates: 0, negativeBehaviors: 0 };
    scores.set(key, { ...current, negativeBehaviors: row.negativeBehaviors });
  });
  const top = [...scores.entries()].map(([id, counts]) => ({ id, ...counts, total: counts.absences * 3 + counts.lates * 2 + counts.negativeBehaviors * 3 }))
    .sort((a, b) => b.total - a.total).slice(0, 6);
  if (!top.length) return [];
  const students = await Student.find({ _id: { $in: top.map((row) => row.id) }, isDeleted: false })
    .populate('userId', 'name phone').populate('classId', 'name grade section').populate({ path: 'parentId', select: 'userId', populate: { path: 'userId', select: 'phone' } }).lean();
  const byId = new Map(students.map((student) => [String(student._id), student]));
  return top.map((row) => ({ ...row, student: serializeStudent(byId.get(row.id)), class: serializeClass(byId.get(row.id)?.classId) }));
};

const buildClassOverview = async (match, period) => {
  const classFilter = { isDeleted: false, isActive: true };
  if (match.schoolId) classFilter.schoolId = match.schoolId;
  if (match.classId?.$in) classFilter._id = match.classId;
  if (typeof match.classId === 'string' || match.classId instanceof mongoose.Types.ObjectId) classFilter._id = match.classId;
  const classes = await Class.find(classFilter).select('name grade section').limit(12).lean();
  if (!classes.length) return [];
  const ids = classes.map((item) => item._id);
  const [studentCounts, attendance, behavior] = await Promise.all([
    Student.aggregate([{ $match: { schoolId: match.schoolId, classId: { $in: ids }, isDeleted: false, isActive: true } }, { $group: { _id: '$classId', count: { $sum: 1 } } }]),
    Attendance.aggregate([{ $match: { ...match, classId: { $in: ids }, date: { $gte: period.start, $lte: period.end } } }, { $group: { _id: { classId: '$classId', type: '$type' }, count: { $sum: 1 } } }]),
    Behavior.aggregate([{ $match: { ...match, classId: { $in: ids }, type: 'negative', createdAt: { $gte: period.start, $lte: period.end } } }, { $group: { _id: '$classId', count: { $sum: 1 } } }]),
  ]);
  const studentsMap = new Map(studentCounts.map((row) => [String(row._id), row.count]));
  const behaviorMap = new Map(behavior.map((row) => [String(row._id), row.count]));
  const attendanceMap = new Map();
  attendance.forEach((row) => attendanceMap.set(`${row._id.classId}:${row._id.type}`, row.count));
  return classes.map((item) => ({ class: serializeClass(item), studentCount: studentsMap.get(String(item._id)) || 0,
    absences: attendanceMap.get(`${item._id}:absence`) || 0, lates: attendanceMap.get(`${item._id}:late`) || 0,
    negativeBehaviors: behaviorMap.get(String(item._id)) || 0 }));
};

const buildAcademic = async (match) => {
  const grades = await Grade.find({ ...match, isPublished: true }).sort({ examDate: -1 }).limit(6)
    .populate({ path: 'studentId', select: 'userId', populate: { path: 'userId', select: 'name' } })
    .populate('subjectId', 'name nameAr').lean();
  return grades.map((grade) => ({
    _id: String(grade._id), title: grade.title, score: grade.score, maxScore: grade.maxScore,
    percentage: Math.round((grade.score / grade.maxScore) * 100), examDate: grade.examDate,
    student: grade.studentId ? { _id: String(grade.studentId._id), name: fullName(grade.studentId.userId) } : null,
    subject: grade.subjectId ? { _id: String(grade.subjectId._id), name: grade.subjectId.nameAr || grade.subjectId.name } : null,
  }));
};

const buildChildren = async (match, period) => {
  const studentFilter = { isDeleted: false };
  if (match.schoolId) studentFilter.schoolId = match.schoolId;
  if (match.studentId) studentFilter._id = match.studentId;
  const students = await Student.find(studentFilter).populate('userId', 'name phone').populate('classId', 'name grade section').lean();
  return Promise.all(students.map(async (student) => {
    const childMatch = { schoolId: match.schoolId, studentId: student._id, isDeleted: false };
    const todayStart = startOfDay();
    const todayEnd = endOfDay();
    const [attendance, todayAttendance, negativeBehaviors, latestGrade] = await Promise.all([
      Attendance.aggregate([{ $match: { ...childMatch, date: { $gte: period.start, $lte: period.end } } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
      Attendance.findOne({ ...childMatch, date: { $gte: todayStart, $lte: todayEnd } }).select('type').lean(),
      Behavior.countDocuments({ ...childMatch, type: 'negative', createdAt: { $gte: period.start, $lte: period.end } }),
      Grade.findOne({ ...childMatch, isPublished: true }).sort({ examDate: -1 }).select('score maxScore title examDate').lean(),
    ]);
    const counts = Object.fromEntries(attendance.map((row) => [row._id, row.count]));
    return { student: serializeStudent(student), class: serializeClass(student.classId), status: todayAttendance?.type === 'absence' ? 'absent' : todayAttendance?.type === 'late' ? 'late' : 'clear',
      absences: counts.absence || 0, lates: counts.late || 0, permissions: counts.permission || 0, negativeBehaviors,
      latestGrade: latestGrade ? { title: latestGrade.title, percentage: Math.round((latestGrade.score / latestGrade.maxScore) * 100), examDate: latestGrade.examDate } : null };
  }));
};

const platformDashboard = async (period, requester) => {
  const [totalSchools, activeSchools, totalUsers, newSchools, schoolsNeedingAttention, unread] = await Promise.all([
    School.countDocuments({ isDeleted: false }), School.countDocuments({ isDeleted: false, isActive: true }),
    User.countDocuments({ isDeleted: false }), School.countDocuments({ isDeleted: false, createdAt: { $gte: period.start, $lte: period.end } }),
    School.find({ isDeleted: false, isActive: false }).sort({ updatedAt: -1 }).limit(6).select('name nameAr isActive updatedAt').lean(),
    Notification.countDocuments({ userId: requester.userId, isRead: false }),
  ]);
  return {
    role: 'super_admin', range: period.range, generatedAt: new Date(), period,
    kpis: { schools: comparison(totalSchools, totalSchools - newSchools), activeSchools: comparison(activeSchools, activeSchools), users: comparison(totalUsers, totalUsers), newSchools: comparison(newSchools, 0), unreadNotifications: comparison(unread, unread) },
    platform: { totalSchools, activeSchools, totalUsers, newSchools, schoolsNeedingAttention: schoolsNeedingAttention.map((school) => ({ ...school, _id: String(school._id) })) },
    alerts: [], studentsNeedingAttention: [], classes: [], weeklyTrend: [], academic: [], children: [],
    totalSchools, totalStudents: 0, activeStudents: 0, totalTeachers: 0, totalClasses: 0, todayAttendance: 0, recentBehavior: 0,
  };
};

const dashboardSummary = async (schoolId, requester = {}, range = 'today') => {
  const allowed = ['super_admin', 'school_admin', 'teacher', 'administrative', 'parent', 'student'];
  if (!allowed.includes(requester.role)) throw new ApiError(403, 'Access denied');
  const period = buildPeriod(range);
  if (requester.role === 'super_admin') return platformDashboard(period, requester);
  const scope = await buildScope(schoolId, requester);
  const recordMatch = { isDeleted: false, schoolId: scope.schoolId };
  if (scope.classId) recordMatch.classId = scope.classId;
  if (scope.studentId) recordMatch.studentId = scope.studentId;

  const studentMatch = { isDeleted: false, schoolId: scope.schoolId };
  if (scope.classId) studentMatch.classId = scope.classId;
  if (scope.studentId) studentMatch._id = scope.studentId;

  const notificationFilter = { userId: requester.userId, isRead: false };
  const canSeeClassOperations = ['school_admin', 'teacher', 'administrative'].includes(requester.role);
  const canSeeAcademic = ['teacher', 'parent', 'student'].includes(requester.role);
  const [attendance, behavior, unread, unreadBefore, totalStudents, activeStudents, totalTeachers, totalClasses, alerts, attention, classes, weeklyTrend, academic] = await Promise.all([
    attendanceCounts(recordMatch, period), behaviorCounts(recordMatch, period),
    Notification.countDocuments(notificationFilter), Notification.countDocuments({ ...notificationFilter, createdAt: { $lt: period.start } }),
    Student.countDocuments(studentMatch), Student.countDocuments({ ...studentMatch, isActive: true }),
    Teacher.countDocuments({ schoolId: scope.schoolId, isDeleted: false }), Class.countDocuments({ schoolId: scope.schoolId, isDeleted: false, isActive: true, ...(scope.classId ? { _id: scope.classId } : {}) }),
    buildAlerts(recordMatch, period, requester), buildAttention(recordMatch, period),
    canSeeClassOperations ? buildClassOverview(recordMatch, period) : Promise.resolve([]),
    buildTrend(recordMatch, period), canSeeAcademic ? buildAcademic(recordMatch) : Promise.resolve([]),
  ]);
  const children = ['parent', 'student'].includes(requester.role) ? await buildChildren(recordMatch, period) : [];
  const kpis = {
    absences: comparison(attendance.current.absence, attendance.previous.absence),
    lates: comparison(attendance.current.late, attendance.previous.late),
    permissions: comparison(attendance.current.permission, attendance.previous.permission),
    negativeBehaviors: comparison(behavior.current, behavior.previous),
    unreadNotifications: comparison(unread, unreadBefore),
  };
  return {
    role: requester.role, range: period.range, generatedAt: new Date(), period, kpis, alerts,
    studentsNeedingAttention: attention, classes, weeklyTrend, academic, children,
    totals: { students: totalStudents, activeStudents, teachers: requester.role === 'teacher' ? 1 : totalTeachers, classes: scope.classId?.$in ? scope.classId.$in.length : totalClasses },
    totalStudents, activeStudents, totalTeachers: requester.role === 'teacher' ? 1 : totalTeachers,
    totalClasses: scope.classId?.$in ? scope.classId.$in.length : totalClasses, totalSchools: 0,
    todayAttendance: attendance.current.absence, recentBehavior: behavior.current,
  };
};

module.exports = { dashboardSummary, __testables: { buildPeriod, comparison } };
