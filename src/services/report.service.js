const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const Attendance = require('../models/Attendance.model');
const Behavior = require('../models/Behavior.model');
const Student = require('../models/Student.model');
const Class = require('../models/Class.model');
const School = require('../models/School.model');
const Teacher = require('../models/Teacher.model');
const gradeService = require('./grade.service');
const ApiError = require('../utils/ApiError');
const { buildCsv } = require('../utils/csv');
const {
  getParentScope,
  getStudentScope,
  getTeacherScope,
  ensureParentStudentAccess,
  ensureStudentSelfAccess,
  ensureTeacherClassAccess,
  ensureTeacherStudentAccess,
} = require('../utils/accessScope');
const { assertRequesterRole } = require('../utils/authorization');
const { toObjectId, toObjectIds } = require('../utils/mongo');

const EMPTY_ATTENDANCE_TOTALS = { total: 0, absence: 0, late: 0, permission: 0 };
const EMPTY_BEHAVIOR_TOTALS = { positive: 0, negative: 0, total: 0 };
const DEFAULT_WORKING_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const REPORT_EXPORT_FORMATS = new Set(['csv', 'pdf', 'xlsx']);

const formatStudentName = (student) => {
  const first = student?.userId?.name?.first;
  const last = student?.userId?.name?.last;
  return [first, last].filter(Boolean).join(' ').trim();
};

const roundPercentage = (value, total) => (total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0);

const normalizeDateRange = (query = {}, { requireRange = true, defaultDays = 90 } = {}) => {
  let start = query.startDate || query.from || null;
  let end = query.endDate || query.to || null;

  if ((!start || !end) && !requireRange) {
    const defaultEnd = new Date();
    const defaultStart = new Date(defaultEnd);
    defaultStart.setDate(defaultStart.getDate() - defaultDays);
    start = start || defaultStart;
    end = end || defaultEnd;
  }

  if (!start || !end) {
    throw new ApiError(400, 'startDate and endDate are required');
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new ApiError(400, 'Invalid date range');
  }
  if (startDate > endDate) {
    throw new ApiError(400, 'startDate must be before or equal to endDate');
  }

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  return {
    startDate,
    endDate,
    startDateLabel: startDate.toISOString(),
    endDateLabel: endDate.toISOString(),
  };
};

const enumerateSchoolDayKeys = (startDate, endDate, workingDays = DEFAULT_WORKING_DAYS) => {
  const allowedDays = new Set((workingDays.length ? workingDays : DEFAULT_WORKING_DAYS).map((day) => String(day).toLowerCase()));
  const keys = [];

  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= endDate) {
    const weekday = WEEKDAY_NAMES[cursor.getDay()];
    if (allowedDays.has(weekday)) {
      keys.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
};

const ensureDailyEntry = (map, key, totalStudents) => {
  if (!map.has(key)) {
    map.set(key, {
      date: key,
      total: 0,
      absence: 0,
      late: 0,
      permission: 0,
      present: totalStudents,
    });
  }

  return map.get(key);
};

const buildAttendanceMetrics = (students, records, schoolDayKeys) => {
  const totalStudents = students.length;
  const dailyMap = new Map(schoolDayKeys.map((key) => [key, {
    date: key,
    total: 0,
    absence: 0,
    late: 0,
    permission: 0,
    present: totalStudents,
  }]));

  const classMap = new Map();
  const studentMap = new Map();

  students.forEach((student) => {
    const classDoc = student.classId && typeof student.classId === 'object'
      ? student.classId
      : null;
    const classKey = String(classDoc?._id || student.classId || 'unassigned');

    if (!classMap.has(classKey)) {
      classMap.set(classKey, {
        class: {
          _id: classDoc?._id || student.classId || null,
          name: classDoc?.name || 'Unassigned',
          grade: classDoc?.grade || null,
          section: classDoc?.section || null,
        },
        absences: 0,
        lates: 0,
        permissions: 0,
        present: 0,
        students: new Map(),
      });
    }

    const classEntry = classMap.get(classKey);
    classEntry.present += schoolDayKeys.length;
    classEntry.students.set(String(student._id), {
      student: {
        _id: student._id,
        name: student.userId?.name || null,
        nationalId: student.nationalId,
      },
      absences: 0,
      lates: 0,
      permissions: 0,
      present: schoolDayKeys.length,
    });

    studentMap.set(String(student._id), { classKey, entry: classEntry.students.get(String(student._id)) });
  });

  const totals = { ...EMPTY_ATTENDANCE_TOTALS };

  records.forEach((record) => {
    const dayKey = new Date(record.date).toISOString().slice(0, 10);
    const dailyEntry = ensureDailyEntry(dailyMap, dayKey, totalStudents);
    const studentEntry = studentMap.get(String(record.studentId));
    const typeKey = record.type;

    totals.total += 1;
    if (Object.prototype.hasOwnProperty.call(totals, typeKey)) {
      totals[typeKey] += 1;
      dailyEntry[typeKey] += 1;
    }

    dailyEntry.total += 1;
    dailyEntry.present = Math.max(dailyEntry.present - 1, 0);

    if (studentEntry) {
      studentEntry.entry.present = Math.max(studentEntry.entry.present - 1, 0);
      if (typeKey === 'absence') studentEntry.entry.absences += 1;
      if (typeKey === 'late') studentEntry.entry.lates += 1;
      if (typeKey === 'permission') studentEntry.entry.permissions += 1;

      const classEntry = classMap.get(studentEntry.classKey);
      classEntry.present = Math.max(classEntry.present - 1, 0);
      if (typeKey === 'absence') classEntry.absences += 1;
      if (typeKey === 'late') classEntry.lates += 1;
      if (typeKey === 'permission') classEntry.permissions += 1;
    }
  });

  const totalSchoolDays = schoolDayKeys.length;
  const totalExpectedRecords = totalStudents * totalSchoolDays;
  const totalPresent = Math.max(totalExpectedRecords - totals.total, 0);

  return {
    totals,
    daily: [...dailyMap.values()].sort((left, right) => left.date.localeCompare(right.date)),
    breakdown: [...classMap.values()].map((entry) => ({
      class: entry.class,
      absences: entry.absences,
      lates: entry.lates,
      permissions: entry.permissions,
      present: entry.present,
      students: [...entry.students.values()],
    })),
    summary: {
      totalStudents,
      totalSchoolDays,
      totalExpectedRecords,
      totalPresent,
      totalAbsences: totals.absence,
      totalLates: totals.late,
      totalPermissions: totals.permission,
      absenceRate: roundPercentage(totals.absence, totalExpectedRecords),
      attendanceRate: roundPercentage(totalPresent, totalExpectedRecords),
    },
  };
};

const normalizeExportFormat = (format) => {
  const normalized = String(format || 'csv').toLowerCase();
  if (!REPORT_EXPORT_FORMATS.has(normalized)) {
    throw new ApiError(400, 'Unsupported export format');
  }
  return normalized;
};

const buildPdfBuffer = ({ title, summaryLines = [], columns, rows }) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  const chunks = [];

  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  doc.fontSize(18).text(title);
  doc.moveDown(0.5);
  summaryLines.filter(Boolean).forEach((line) => {
    doc.fontSize(10).text(line);
  });

  doc.moveDown();
  doc.fontSize(10).text(columns.map((column) => column.label).join(' | '));
  doc.moveDown(0.25);

  rows.forEach((row) => {
    const line = columns.map((column) => String(row[column.key] ?? '')).join(' | ');
    doc.text(line);
  });

  doc.end();
});

const buildXlsxBuffer = (sheetName, columns, rows) => {
  const normalizedRows = (rows.length ? rows : [{}]).map((row) => columns.reduce((accumulator, column) => {
    accumulator[column.label] = row[column.key] ?? '';
    return accumulator;
  }, {}));

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(normalizedRows);
  XLSX.utils.book_append_sheet(workbook, sheet, String(sheetName || 'Report').slice(0, 31));

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const buildExportFile = async ({ format, baseFileName, title, sheetName, columns, rows, summaryLines = [] }) => {
  const normalizedFormat = normalizeExportFormat(format);

  if (normalizedFormat === 'pdf') {
    return {
      format: normalizedFormat,
      fileName: `${baseFileName}.pdf`,
      mimeType: 'application/pdf',
      content: await buildPdfBuffer({ title, summaryLines, columns, rows }),
    };
  }

  if (normalizedFormat === 'xlsx') {
    return {
      format: normalizedFormat,
      fileName: `${baseFileName}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: buildXlsxBuffer(sheetName, columns, rows),
    };
  }

  return {
    format: normalizedFormat,
    fileName: `${baseFileName}.csv`,
    mimeType: 'text/csv; charset=utf-8',
    content: buildCsv(columns, rows),
  };
};

const ensureScopedSchoolContext = (schoolId, requester = {}) => {
  if (requester.role !== 'super_admin' && !schoolId) {
    throw new ApiError(403, 'Missing school context');
  }
};

const buildSchoolWideSummary = async (schoolId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const baseFilter = { isDeleted: false };
  if (schoolId) baseFilter.schoolId = schoolId;

  const [totalStudents, activeStudents, totalTeachers, totalClasses, totalSchools, todayAttendance, recentBehavior] =
    await Promise.all([
      Student.countDocuments({ ...baseFilter }),
      Student.countDocuments({ ...baseFilter, isActive: true }),
      Teacher.countDocuments({ ...baseFilter }),
      Class.countDocuments({ ...baseFilter, isActive: true }),
      School.countDocuments({ isDeleted: false }),
      Attendance.countDocuments({ ...baseFilter, date: { $gte: today } }),
      Behavior.countDocuments({ ...baseFilter, createdAt: { $gte: today } }),
    ]);

  return {
    totalStudents,
    activeStudents,
    totalTeachers,
    totalClasses,
    totalSchools,
    todayAttendance,
    recentBehavior,
  };
};

/**
 * Attendance report for a class or school in a date range
 */
const attendanceReport = async ({ classId, studentId, startDate, endDate, academicYear }, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher']);
  ensureScopedSchoolContext(schoolId, requester);

  const range = normalizeDateRange({ classId, studentId, startDate, endDate, academicYear });

  const filter = {
    date: { $gte: range.startDate, $lte: range.endDate },
    isDeleted: false,
  };
  const studentFilter = { isDeleted: false, isActive: true };
  if (schoolId) filter.schoolId = toObjectId(schoolId, 'schoolId');
  if (schoolId) studentFilter.schoolId = toObjectId(schoolId, 'schoolId');

  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    if (classId) {
      ensureTeacherClassAccess(classId, scope);
      filter.classId = toObjectId(classId, 'classId');
      studentFilter.classId = toObjectId(classId, 'classId');
    } else {
      const scopedClassIds = toObjectIds(scope.classIds, 'classId');
      filter.classId = { $in: scopedClassIds };
      studentFilter.classId = { $in: scopedClassIds };
    }

    if (studentId) {
      await ensureTeacherStudentAccess(studentId, schoolId, scope);
      filter.studentId = toObjectId(studentId, 'studentId');
      studentFilter._id = toObjectId(studentId, 'studentId');
    }
  } else {
    if (classId) {
      filter.classId = toObjectId(classId, 'classId');
      studentFilter.classId = toObjectId(classId, 'classId');
    }
    if (studentId) {
      filter.studentId = toObjectId(studentId, 'studentId');
      studentFilter._id = toObjectId(studentId, 'studentId');
    }
  }

  if (academicYear) filter.academicYear = String(academicYear);

  const [students, attendanceRecords, school] = await Promise.all([
    Student.find(studentFilter)
      .select('_id userId classId nationalId')
      .populate('userId', 'name')
      .populate('classId', 'name grade section')
      .lean(),
    Attendance.find(filter).select('studentId classId type date').lean(),
    schoolId ? School.findById(schoolId).select('settings') : null,
  ]);

  const schoolDayKeys = enumerateSchoolDayKeys(range.startDate, range.endDate, school?.settings?.workingDays || DEFAULT_WORKING_DAYS);
  const metrics = buildAttendanceMetrics(students, attendanceRecords, schoolDayKeys);

  return {
    period: { startDate: range.startDateLabel, endDate: range.endDateLabel },
    daily: metrics.daily,
    totals: metrics.totals,
    totalRecords: metrics.totals.total,
    summary: metrics.summary,
    breakdown: metrics.breakdown,
  };
};

/**
 * Behavior report for a class or school
 */
const behaviorReport = async ({ classId, studentId, type, startDate, endDate }, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher']);
  ensureScopedSchoolContext(schoolId, requester);

  const filter = { isDeleted: false };
  if (schoolId) filter.schoolId = toObjectId(schoolId, 'schoolId');

  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    if (classId) {
      ensureTeacherClassAccess(classId, scope);
      filter.classId = toObjectId(classId, 'classId');
    } else {
      filter.classId = { $in: toObjectIds(scope.classIds, 'classId') };
    }

    if (studentId) {
      await ensureTeacherStudentAccess(studentId, schoolId, scope);
      filter.studentId = toObjectId(studentId, 'studentId');
    }
  } else {
    if (classId) filter.classId = toObjectId(classId, 'classId');
    if (studentId) filter.studentId = toObjectId(studentId, 'studentId');
  }

  if (type) filter.type = type;

  let normalizedRange = null;
  if (startDate || endDate) {
    normalizedRange = normalizeDateRange({ startDate, endDate }, { requireRange: true });
    filter.createdAt = {
      $gte: normalizedRange.startDate,
      $lte: normalizedRange.endDate,
    };
  }

  const [report] = await Behavior.aggregate([
    { $match: filter },
    {
      $facet: {
        records: [
          { $sort: { createdAt: -1 } },
          {
            $lookup: {
              from: 'students',
              let: { studentId: '$studentId' },
              pipeline: [
                { $match: { $expr: { $eq: ['$_id', '$$studentId'] } } },
                { $project: { _id: 1, userId: 1, nationalId: 1 } },
              ],
              as: 'student',
            },
          },
          { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'users',
              let: { studentUserId: '$student.userId' },
              pipeline: [
                { $match: { $expr: { $eq: ['$_id', '$$studentUserId'] } } },
                { $project: { _id: 1, name: 1 } },
              ],
              as: 'studentUser',
            },
          },
          { $unwind: { path: '$studentUser', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'classes',
              let: { classId: '$classId' },
              pipeline: [
                { $match: { $expr: { $eq: ['$_id', '$$classId'] } } },
                { $project: { _id: 1, name: 1, grade: 1 } },
              ],
              as: 'class',
            },
          },
          { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              schoolId: 1,
              teacherId: 1,
              type: 1,
              category: 1,
              description: 1,
              attachments: 1,
              notifyParent: 1,
              academicYear: 1,
              createdAt: 1,
              updatedAt: 1,
              studentId: {
                $cond: [
                  { $ifNull: ['$student._id', false] },
                  {
                    _id: '$student._id',
                    userId: {
                      _id: '$studentUser._id',
                      name: '$studentUser.name',
                    },
                    nationalId: '$student.nationalId',
                  },
                  null,
                ],
              },
              classId: {
                $cond: [
                  { $ifNull: ['$class._id', false] },
                  {
                    _id: '$class._id',
                    name: '$class.name',
                    grade: '$class.grade',
                  },
                  null,
                ],
              },
            },
          },
        ],
        totals: [
          {
            $group: {
              _id: null,
              positive: { $sum: { $cond: [{ $eq: ['$type', 'positive'] }, 1, 0] } },
              negative: { $sum: { $cond: [{ $eq: ['$type', 'negative'] }, 1, 0] } },
              total: { $sum: 1 },
            },
          },
          { $project: { _id: 0, positive: 1, negative: 1, total: 1 } },
        ],
      },
    },
  ]);

  const totals = report?.totals?.[0] || EMPTY_BEHAVIOR_TOTALS;

  return {
    period: normalizedRange
      ? { startDate: normalizedRange.startDateLabel, endDate: normalizedRange.endDateLabel }
      : null,
    records: report?.records || [],
    totals: { positive: totals.positive, negative: totals.negative },
    positive: totals.positive,
    negative: totals.negative,
    total: totals.total,
    summary: {
      totalNotes: totals.total,
      positive: totals.positive,
      negative: totals.negative,
      positiveRate: roundPercentage(totals.positive, totals.total),
    },
  };
};

const gradeReport = async (query, schoolId, requester = {}) => gradeService.gradeReport(query, schoolId, requester);

const studentReport = async ({ studentId, startDate, endDate, academicYear }, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher', 'parent', 'student']);
  ensureScopedSchoolContext(schoolId, requester);

  let resolvedStudentId = studentId;

  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    if (!resolvedStudentId) {
      throw new ApiError(400, 'studentId is required');
    }
    await ensureTeacherStudentAccess(resolvedStudentId, schoolId, scope);
  } else if (requester.role === 'parent') {
    const parentScope = await getParentScope(requester.userId, schoolId);
    if (!resolvedStudentId) {
      throw new ApiError(400, 'studentId is required');
    }
    await ensureParentStudentAccess(resolvedStudentId, schoolId, parentScope);
  } else if (requester.role === 'student') {
    const scope = await getStudentScope(requester.userId, schoolId);
    resolvedStudentId = resolvedStudentId || scope.studentId;
    ensureStudentSelfAccess(resolvedStudentId, scope);
  } else if (!resolvedStudentId) {
    throw new ApiError(400, 'studentId is required');
  }

  const range = normalizeDateRange({ startDate, endDate }, { requireRange: false, defaultDays: 90 });
  const studentObjectId = toObjectId(resolvedStudentId, 'studentId');

  const [student, attendanceRecords, behaviorRecords, school, gradeProfile] = await Promise.all([
    Student.findOne({ _id: studentObjectId, schoolId, isDeleted: false })
      .select('_id userId classId nationalId')
      .populate('userId', 'name')
      .populate('classId', 'name grade section')
      .lean(),
    Attendance.find({
      schoolId,
      studentId: studentObjectId,
      isDeleted: false,
      date: { $gte: range.startDate, $lte: range.endDate },
      ...(academicYear ? { academicYear: String(academicYear) } : {}),
    })
      .select('type date')
      .sort({ date: 1 })
      .lean(),
    Behavior.find({
      schoolId,
      studentId: studentObjectId,
      isDeleted: false,
      createdAt: { $gte: range.startDate, $lte: range.endDate },
      ...(academicYear ? { academicYear: String(academicYear) } : {}),
    })
      .select('type category description createdAt')
      .sort({ createdAt: -1 })
      .lean(),
    School.findById(schoolId).select('settings').lean(),
    gradeService.getStudentGradeProfile(resolvedStudentId, schoolId, requester, { startDate, endDate, academicYear }),
  ]);

  if (!student) {
    throw new ApiError(404, 'Student not found');
  }

  const schoolDayKeys = enumerateSchoolDayKeys(range.startDate, range.endDate, school?.settings?.workingDays || DEFAULT_WORKING_DAYS);
  const attendanceTotals = attendanceRecords.reduce((accumulator, record) => {
    accumulator.total += 1;
    if (record.type === 'absence') accumulator.absence += 1;
    if (record.type === 'late') accumulator.late += 1;
    if (record.type === 'permission') accumulator.permission += 1;
    return accumulator;
  }, { ...EMPTY_ATTENDANCE_TOTALS });

  const monthlyMap = new Map();
  attendanceRecords.forEach((record) => {
    const monthKey = new Date(record.date).toISOString().slice(0, 7);
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, { month: monthKey, absences: 0, lates: 0, permissions: 0 });
    }

    const entry = monthlyMap.get(monthKey);
    if (record.type === 'absence') entry.absences += 1;
    if (record.type === 'late') entry.lates += 1;
    if (record.type === 'permission') entry.permissions += 1;
  });

  const totalDays = schoolDayKeys.length;
  const presentDays = Math.max(totalDays - attendanceTotals.total, 0);
  const positiveBehavior = behaviorRecords.filter((record) => record.type === 'positive').length;
  const negativeBehavior = behaviorRecords.filter((record) => record.type === 'negative').length;

  return {
    student: {
      _id: student._id,
      nationalId: student.nationalId,
      name: student.userId?.name || null,
      class: student.classId
        ? {
          _id: student.classId._id,
          name: student.classId.name,
          grade: student.classId.grade,
          section: student.classId.section,
        }
        : null,
    },
    period: {
      startDate: range.startDateLabel,
      endDate: range.endDateLabel,
    },
    attendance: {
      totalDays,
      absences: attendanceTotals.absence,
      lates: attendanceTotals.late,
      permissions: attendanceTotals.permission,
      attendanceRate: roundPercentage(presentDays, totalDays),
      monthly: [...monthlyMap.values()].sort((left, right) => left.month.localeCompare(right.month)),
    },
    behavior: {
      positive: positiveBehavior,
      negative: negativeBehavior,
      recent: behaviorRecords.slice(0, 5).map((record) => ({
        type: record.type,
        category: record.category || null,
        description: record.description,
        date: record.createdAt ? new Date(record.createdAt).toISOString() : null,
      })),
    },
    grades: {
      overview: gradeProfile.overview,
      subjects: gradeProfile.subjects,
      recentAssessments: gradeProfile.recentAssessments,
    },
  };
};

const exportAttendanceReport = async (query, schoolId, requester = {}) => {
  const report = await attendanceReport(query, schoolId, requester);
  const rows = report.daily.map((day) => ({
    date: day.date,
    total: day.total,
    absence: day.absence,
    late: day.late,
    permission: day.permission,
  }));

  rows.push({
    date: 'TOTAL',
    total: report.totals.total,
    absence: report.totals.absence,
    late: report.totals.late,
    permission: report.totals.permission,
  });

  return buildExportFile({
    format: query.format,
    baseFileName: `attendance-report-${report.period.startDate.slice(0, 10)}-${report.period.endDate.slice(0, 10)}`,
    title: 'Attendance Report',
    sheetName: 'Attendance',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'total', label: 'Total records' },
      { key: 'absence', label: 'Absence' },
      { key: 'late', label: 'Late' },
      { key: 'permission', label: 'Permission' },
    ],
    rows,
    summaryLines: [
      `Period: ${report.period.startDate} -> ${report.period.endDate}`,
      `Students: ${report.summary.totalStudents}`,
      `Attendance rate: ${report.summary.attendanceRate}%`,
      `Absence rate: ${report.summary.absenceRate}%`,
    ],
  });
};

const exportBehaviorReport = async (query, schoolId, requester = {}) => {
  const report = await behaviorReport(query, schoolId, requester);
  const rows = report.records.map((record) => ({
    createdAt: record.createdAt ? new Date(record.createdAt).toISOString() : '',
    studentName: formatStudentName(record.studentId),
    nationalId: record.studentId?.nationalId || '',
    className: record.classId?.name || '',
    grade: record.classId?.grade || '',
    type: record.type,
    category: record.category || '',
    description: record.description,
    attachments: Array.isArray(record.attachments) ? record.attachments.length : 0,
    notifyParent: record.notifyParent ? 'yes' : 'no',
  }));

  return buildExportFile({
    format: query.format,
    baseFileName: `behavior-report-${(query.startDate || query.from || 'all').slice ? (query.startDate || query.from || 'all').slice(0, 10) : 'all'}-${(query.endDate || query.to || 'all').slice ? (query.endDate || query.to || 'all').slice(0, 10) : 'all'}`,
    title: 'Behavior Report',
    sheetName: 'Behavior',
    columns: [
      { key: 'createdAt', label: 'Created at' },
      { key: 'studentName', label: 'Student' },
      { key: 'nationalId', label: 'National ID' },
      { key: 'className', label: 'Class' },
      { key: 'grade', label: 'Grade' },
      { key: 'type', label: 'Type' },
      { key: 'category', label: 'Category' },
      { key: 'description', label: 'Description' },
      { key: 'attachments', label: 'Attachment count' },
      { key: 'notifyParent', label: 'Notify parent' },
    ],
    rows,
    summaryLines: [
      `Positive notes: ${report.positive}`,
      `Negative notes: ${report.negative}`,
      `Positive rate: ${report.summary.positiveRate}%`,
    ],
  });
};

/**
 * Dashboard summary statistics for a school (or all schools if super_admin)
 */
const schoolSummary = async (schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin']);
  ensureScopedSchoolContext(schoolId, requester);

  return buildSchoolWideSummary(schoolId);
};

const dashboardSummary = async (schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher', 'parent']);
  ensureScopedSchoolContext(schoolId, requester);

  if (requester.role === 'super_admin' || requester.role === 'school_admin') {
    return buildSchoolWideSummary(schoolId);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    const studentFilter = { schoolId, classId: { $in: scope.classIds }, isDeleted: false };

    const [totalStudents, activeStudents, totalClasses, todayAttendance, recentBehavior] = await Promise.all([
      Student.countDocuments(studentFilter),
      Student.countDocuments({ ...studentFilter, isActive: true }),
      Class.countDocuments({ schoolId, _id: { $in: scope.classIds }, isDeleted: false, isActive: true }),
      Attendance.countDocuments({ schoolId, classId: { $in: scope.classIds }, isDeleted: false, date: { $gte: today } }),
      Behavior.countDocuments({ schoolId, classId: { $in: scope.classIds }, isDeleted: false, createdAt: { $gte: today } }),
    ]);

    return {
      totalStudents,
      activeStudents,
      totalTeachers: 1,
      totalClasses,
      totalSchools: 0,
      todayAttendance,
      recentBehavior,
    };
  }

  const parentScope = await getParentScope(requester.userId, schoolId);
  const scopedChildIds = toObjectIds(parentScope.childIds, 'studentId');
  const childSummary = scopedChildIds.length
    ? (await Student.aggregate([
      {
        $match: {
          _id: { $in: scopedChildIds },
          schoolId: toObjectId(schoolId, 'schoolId'),
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          totalStudents: { $sum: 1 },
          activeStudents: { $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] } },
          classIds: { $addToSet: '$classId' },
          childIds: { $push: '$_id' },
        },
      },
      {
        $project: {
          _id: 0,
          totalStudents: 1,
          activeStudents: 1,
          totalClasses: { $size: '$classIds' },
          childIds: 1,
        },
      },
    ]))[0]
    : null;

  const children = childSummary || {
    totalStudents: 0,
    activeStudents: 0,
    totalClasses: 0,
    childIds: [],
  };

  const [todayAttendance, recentBehavior] = await Promise.all([
    children.childIds.length
      ? Attendance.countDocuments({ schoolId, studentId: { $in: children.childIds }, isDeleted: false, date: { $gte: today } })
      : 0,
    children.childIds.length
      ? Behavior.countDocuments({ schoolId, studentId: { $in: children.childIds }, isDeleted: false, createdAt: { $gte: today } })
      : 0,
  ]);

  return {
    totalStudents: children.totalStudents,
    activeStudents: children.activeStudents,
    totalTeachers: 0,
    totalClasses: children.totalClasses,
    totalSchools: 0,
    todayAttendance,
    recentBehavior,
  };
};

module.exports = {
  attendanceReport,
  behaviorReport,
  gradeReport,
  studentReport,
  exportAttendanceReport,
  exportBehaviorReport,
  schoolSummary,
  dashboardSummary,
};
