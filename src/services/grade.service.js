const Grade = require('../models/Grade.model');
const Student = require('../models/Student.model');
const Subject = require('../models/Subject.model');
const Class = require('../models/Class.model');
const Teacher = require('../models/Teacher.model');
const ApiError = require('../utils/ApiError');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');
const {
  getParentScope,
  getStudentScope,
  getTeacherAssignmentScope,
  ensureParentStudentAccess,
  ensureStudentClassAccess,
  ensureStudentSelfAccess,
  ensureTeacherClassAccess,
  ensureTeacherStudentAccess,
} = require('../utils/accessScope');
const { assertRequesterRole } = require('../utils/authorization');
const { toObjectId, toObjectIds } = require('../utils/mongo');

const PASSING_PERCENTAGE = 60;

const LEVELS = [
  { key: 'excellent', label: 'ممتاز', min: 90 },
  { key: 'healthy', label: 'جيد', min: 75 },
  { key: 'watch', label: 'تحت المراقبة', min: 60 },
  { key: 'critical', label: 'بحاجة إلى تدخل', min: 0 },
];

const roundMetric = (value) => Number(value.toFixed(1));

const getPercentage = (score, maxScore) => (
  Number(maxScore) > 0 ? roundMetric((Number(score) / Number(maxScore)) * 100) : 0
);

const getAcademicLevel = (percentage) => {
  const level = LEVELS.find((item) => percentage >= item.min) || LEVELS[LEVELS.length - 1];
  return { key: level.key, label: level.label };
};

const normalizeDateRange = (query = {}) => {
  const startValue = query.startDate || query.from;
  const endValue = query.endDate || query.to;

  if (!startValue && !endValue) return null;
  if (!startValue || !endValue) {
    throw new ApiError(400, 'startDate and endDate are required');
  }

  const startDate = new Date(startValue);
  const endDate = new Date(endValue);

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

const ensureScoreRange = (score, maxScore) => {
  if (Number(score) > Number(maxScore)) {
    throw new ApiError(400, 'score cannot exceed maxScore');
  }
};

const ensureTeacherSubjectAccess = (subjectId, scope) => {
  if (!scope.subjectIds.includes(String(subjectId))) {
    throw new ApiError(403, 'Access denied for this subject');
  }
};

const populateGradeQuery = (query) => query
  .populate({
    path: 'studentId',
    select: 'nationalId userId classId',
    populate: [
      { path: 'userId', select: 'name' },
      { path: 'classId', select: 'name grade section' },
    ],
  })
  .populate('subjectId', 'name nameAr code')
  .populate('classId', 'name grade section academicYear')
  .populate({
    path: 'teacherId',
    select: 'userId',
    populate: { path: 'userId', select: 'name' },
  });

const mapGradeRecord = (grade) => ({
  ...grade,
  percentage: getPercentage(grade.score, grade.maxScore),
});

const buildScopedFilter = async (query, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher', 'parent', 'student']);

  const filter = { isDeleted: false };
  if (schoolId) filter.schoolId = toObjectId(schoolId, 'schoolId');

  const range = normalizeDateRange(query);
  if (range) {
    filter.examDate = { $gte: range.startDate, $lte: range.endDate };
  }

  if (query.academicYear) filter.academicYear = String(query.academicYear);
  if (query.assessmentType) filter.assessmentType = query.assessmentType;
  if (query.search) {
    filter.title = { $regex: query.search, $options: 'i' };
  }

  if (requester.role === 'teacher') {
    const scope = await getTeacherAssignmentScope(requester.userId, schoolId);
    const scopedClassIds = toObjectIds(scope.classIds, 'classId');

    filter.teacherId = toObjectId(scope.teacherId, 'teacherId');

    if (query.classId) {
      ensureTeacherClassAccess(query.classId, scope);
      filter.classId = toObjectId(query.classId, 'classId');
    } else {
      filter.classId = { $in: scopedClassIds.length ? scopedClassIds : [] };
    }

    if (query.studentId) {
      await ensureTeacherStudentAccess(query.studentId, schoolId, scope);
      filter.studentId = toObjectId(query.studentId, 'studentId');
    }

    if (query.subjectId) {
      ensureTeacherSubjectAccess(query.subjectId, scope);
      filter.subjectId = toObjectId(query.subjectId, 'subjectId');
    }

    return { filter, range };
  }

  if (requester.role === 'parent') {
    const scope = await getParentScope(requester.userId, schoolId);

    if (query.studentId) {
      await ensureParentStudentAccess(query.studentId, schoolId, scope);
      filter.studentId = toObjectId(query.studentId, 'studentId');
    } else {
      filter.studentId = { $in: toObjectIds(scope.childIds, 'studentId') };
    }

    if (query.classId) filter.classId = toObjectId(query.classId, 'classId');
    if (query.subjectId) filter.subjectId = toObjectId(query.subjectId, 'subjectId');
    if (query.teacherId) filter.teacherId = toObjectId(query.teacherId, 'teacherId');

    return { filter, range };
  }

  if (requester.role === 'student') {
    const scope = await getStudentScope(requester.userId, schoolId);
    const resolvedStudentId = query.studentId || scope.studentId;

    ensureStudentSelfAccess(resolvedStudentId, scope);
    filter.studentId = toObjectId(resolvedStudentId, 'studentId');

    if (query.classId) {
      ensureStudentClassAccess(query.classId, scope);
      filter.classId = toObjectId(query.classId, 'classId');
    } else if (scope.classId) {
      filter.classId = toObjectId(scope.classId, 'classId');
    }

    if (query.subjectId) filter.subjectId = toObjectId(query.subjectId, 'subjectId');
    if (query.teacherId) filter.teacherId = toObjectId(query.teacherId, 'teacherId');

    return { filter, range };
  }

  if (query.classId) filter.classId = toObjectId(query.classId, 'classId');
  if (query.studentId) filter.studentId = toObjectId(query.studentId, 'studentId');
  if (query.subjectId) filter.subjectId = toObjectId(query.subjectId, 'subjectId');
  if (query.teacherId) filter.teacherId = toObjectId(query.teacherId, 'teacherId');

  return { filter, range };
};

const resolveTeacherReference = async (teacherId, schoolId, subjectId, classId) => {
  if (!teacherId) return null;

  const teacher = await Teacher.findOne({ _id: teacherId, schoolId, isDeleted: false })
    .select('_id classes subjects')
    .lean();

  if (!teacher) {
    throw new ApiError(404, 'Teacher not found');
  }

  if (teacher.classes?.length && !teacher.classes.some((item) => String(item) === String(classId))) {
    throw new ApiError(400, 'Teacher is not assigned to this class');
  }

  if (teacher.subjects?.length && !teacher.subjects.some((item) => String(item) === String(subjectId))) {
    throw new ApiError(400, 'Teacher is not assigned to this subject');
  }

  return String(teacher._id);
};

const validateGradePayload = async (payload, schoolId, requester = {}) => {
  const { studentId, subjectId, classId, teacherId, score, maxScore, academicYear } = payload;

  ensureScoreRange(score, maxScore);

  const [student, subject, cls] = await Promise.all([
    Student.findOne({ _id: studentId, schoolId, isDeleted: false })
      .select('_id classId userId nationalId')
      .populate('userId', 'name')
      .lean(),
    Subject.findOne({ _id: subjectId, schoolId, isDeleted: false })
      .select('_id name nameAr code')
      .lean(),
    Class.findOne({ _id: classId, schoolId, isDeleted: false })
      .select('_id name grade section academicYear')
      .lean(),
  ]);

  if (!student) throw new ApiError(404, 'Student not found');
  if (!subject) throw new ApiError(404, 'Subject not found');
  if (!cls) throw new ApiError(404, 'Class not found');

  if (String(student.classId) !== String(classId)) {
    throw new ApiError(400, 'Student is not assigned to this class');
  }

  let resolvedTeacherId = teacherId ? String(teacherId) : null;

  if (requester.role === 'teacher') {
    const scope = await getTeacherAssignmentScope(requester.userId, schoolId);
    ensureTeacherClassAccess(classId, scope);
    await ensureTeacherStudentAccess(studentId, schoolId, scope);
    ensureTeacherSubjectAccess(subjectId, scope);
    resolvedTeacherId = scope.teacherId;
  } else if (resolvedTeacherId) {
    resolvedTeacherId = await resolveTeacherReference(resolvedTeacherId, schoolId, subjectId, classId);
  }

  return {
    student,
    subject,
    cls,
    teacherId: resolvedTeacherId ? toObjectId(resolvedTeacherId, 'teacherId') : null,
    academicYear: academicYear || cls.academicYear,
  };
};

const listGrades = async (query, schoolId, requester = {}) => {
  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['createdAt', 'examDate', 'title', 'score', 'maxScore']);
  const { filter } = await buildScopedFilter(query, schoolId, requester);

  const [grades, total] = await Promise.all([
    populateGradeQuery(
      Grade.find(filter).skip(skip).limit(limit).sort(sort),
    ).lean(),
    Grade.countDocuments(filter),
  ]);

  return {
    data: grades.map(mapGradeRecord),
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt', 'examDate', 'title', 'score', 'maxScore'],
      defaultSortField: 'examDate',
    }),
  };
};

const getGradeById = async (gradeId, schoolId, requester = {}) => {
  const { filter } = await buildScopedFilter({}, schoolId, requester);
  filter._id = toObjectId(gradeId, 'gradeId');

  const grade = await populateGradeQuery(Grade.findOne(filter)).lean();
  if (!grade) throw new ApiError(404, 'Grade not found');
  return mapGradeRecord(grade);
};

const createGrade = async (data, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'teacher']);

  const payload = {
    studentId: toObjectId(data.studentId, 'studentId'),
    subjectId: toObjectId(data.subjectId, 'subjectId'),
    classId: toObjectId(data.classId, 'classId'),
    teacherId: data.teacherId ? toObjectId(data.teacherId, 'teacherId') : null,
    title: String(data.title || '').trim(),
    assessmentType: data.assessmentType,
    score: Number(data.score),
    maxScore: Number(data.maxScore),
    examDate: data.examDate,
    term: data.term || null,
    notes: data.notes || null,
    academicYear: data.academicYear || null,
    isPublished: data.isPublished !== false,
  };

  const validated = await validateGradePayload(payload, schoolId, requester);

  const grade = await Grade.create({
    schoolId,
    studentId: payload.studentId,
    subjectId: payload.subjectId,
    classId: payload.classId,
    teacherId: validated.teacherId,
    title: payload.title,
    assessmentType: payload.assessmentType,
    score: payload.score,
    maxScore: payload.maxScore,
    examDate: payload.examDate,
    term: payload.term,
    notes: payload.notes,
    academicYear: validated.academicYear,
    isPublished: payload.isPublished,
  });

  return getGradeById(grade._id, schoolId, requester.role === 'teacher'
    ? requester
    : { role: 'school_admin', userId: requester.userId });
};

const updateGrade = async (gradeId, schoolId, updates, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'teacher']);

  const { filter } = await buildScopedFilter({}, schoolId, requester);
  filter._id = toObjectId(gradeId, 'gradeId');

  const existing = await Grade.findOne(filter).lean();
  if (!existing) throw new ApiError(404, 'Grade not found');

  const payload = {
    studentId: toObjectId(updates.studentId || existing.studentId, 'studentId'),
    subjectId: toObjectId(updates.subjectId || existing.subjectId, 'subjectId'),
    classId: toObjectId(updates.classId || existing.classId, 'classId'),
    teacherId: updates.teacherId === null
      ? null
      : toObjectId(updates.teacherId || existing.teacherId, 'teacherId'),
    title: updates.title !== undefined ? String(updates.title).trim() : existing.title,
    assessmentType: updates.assessmentType || existing.assessmentType,
    score: updates.score !== undefined ? Number(updates.score) : Number(existing.score),
    maxScore: updates.maxScore !== undefined ? Number(updates.maxScore) : Number(existing.maxScore),
    examDate: updates.examDate || existing.examDate,
    term: updates.term !== undefined ? updates.term || null : existing.term,
    notes: updates.notes !== undefined ? updates.notes || null : existing.notes,
    academicYear: updates.academicYear || existing.academicYear,
    isPublished: updates.isPublished !== undefined ? updates.isPublished : existing.isPublished,
  };

  const validated = await validateGradePayload(payload, schoolId, requester);

  await Grade.findOneAndUpdate(
    { _id: existing._id, schoolId, isDeleted: false },
    {
      $set: {
        studentId: payload.studentId,
        subjectId: payload.subjectId,
        classId: payload.classId,
        teacherId: validated.teacherId,
        title: payload.title,
        assessmentType: payload.assessmentType,
        score: payload.score,
        maxScore: payload.maxScore,
        examDate: payload.examDate,
        term: payload.term,
        notes: payload.notes,
        academicYear: validated.academicYear,
        isPublished: payload.isPublished,
      },
    },
    { new: true, runValidators: true },
  );

  return getGradeById(existing._id, schoolId, requester.role === 'teacher'
    ? requester
    : { role: 'school_admin', userId: requester.userId });
};

const deleteGrade = async (gradeId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin', 'teacher']);

  const { filter } = await buildScopedFilter({}, schoolId, requester);
  filter._id = toObjectId(gradeId, 'gradeId');

  const grade = await Grade.findOneAndUpdate(
    filter,
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  );

  if (!grade) throw new ApiError(404, 'Grade not found');
};

const getStudentGradeProfile = async (studentId, schoolId, requester = {}, query = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher', 'parent', 'student']);

  const targetStudentId = studentId || query.studentId;
  if (!targetStudentId) throw new ApiError(400, 'studentId is required');

  const { filter } = await buildScopedFilter({ ...query, studentId: targetStudentId }, schoolId, requester);
  const studentObjectId = filter.studentId;

  const student = await Student.findOne({ _id: studentObjectId, schoolId, isDeleted: false })
    .select('_id nationalId userId classId')
    .populate('userId', 'name')
    .populate('classId', 'name grade section academicYear')
    .lean();

  if (!student) throw new ApiError(404, 'Student not found');

  const teacherFilter = { schoolId, isDeleted: false, classes: student.classId?._id || student.classId };
  if (requester.role === 'teacher') {
    const scope = await getTeacherAssignmentScope(requester.userId, schoolId);
    teacherFilter._id = toObjectId(scope.teacherId, 'teacherId');
  }

  const [gradeRecords, teachers] = await Promise.all([
    populateGradeQuery(Grade.find(filter).sort({ examDate: -1, createdAt: -1 })).lean(),
    Teacher.find(teacherFilter)
      .select('_id userId subjects')
      .populate('userId', 'name')
      .populate('subjects', 'name nameAr code')
      .lean(),
  ]);

  const normalizedRecords = gradeRecords.map(mapGradeRecord);
  const assignedSubjects = new Map();
  const recordsBySubject = new Map();

  teachers.forEach((teacher) => {
    (teacher.subjects || []).forEach((subject) => {
      const subjectIdKey = String(subject._id);
      if (!assignedSubjects.has(subjectIdKey)) {
        assignedSubjects.set(subjectIdKey, {
          subject: {
            _id: subject._id,
            name: subject.name,
            nameAr: subject.nameAr || null,
            code: subject.code || null,
          },
          teachers: [],
        });
      }

      const entry = assignedSubjects.get(subjectIdKey);
      const teacherName = teacher.userId?.name || null;
      if (teacherName && !entry.teachers.some((item) => String(item._id) === String(teacher._id))) {
        entry.teachers.push({ _id: teacher._id, name: teacherName });
      }
    });
  });

  normalizedRecords.forEach((record) => {
    const subjectIdKey = String(record.subjectId?._id || record.subjectId);
    if (!recordsBySubject.has(subjectIdKey)) {
      recordsBySubject.set(subjectIdKey, []);
    }
    recordsBySubject.get(subjectIdKey).push(record);

    if (!assignedSubjects.has(subjectIdKey) && record.subjectId && typeof record.subjectId === 'object') {
      assignedSubjects.set(subjectIdKey, {
        subject: {
          _id: record.subjectId._id,
          name: record.subjectId.name,
          nameAr: record.subjectId.nameAr || null,
          code: record.subjectId.code || null,
        },
        teachers: [],
      });
    }
  });

  const subjects = Array.from(assignedSubjects.entries())
    .map(([subjectIdKey, entry]) => {
      const subjectRecords = recordsBySubject.get(subjectIdKey) || [];
      const averagePercentage = subjectRecords.length
        ? roundMetric(subjectRecords.reduce((sum, record) => sum + record.percentage, 0) / subjectRecords.length)
        : null;
      const highestPercentage = subjectRecords.length
        ? Math.max(...subjectRecords.map((record) => record.percentage))
        : null;
      const latestRecord = subjectRecords[0] || null;

      return {
        subject: entry.subject,
        teachers: entry.teachers,
        assessmentCount: subjectRecords.length,
        averagePercentage,
        highestPercentage,
        academicLevel: averagePercentage !== null ? getAcademicLevel(averagePercentage) : null,
        latestRecord: latestRecord
          ? {
            _id: latestRecord._id,
            title: latestRecord.title,
            assessmentType: latestRecord.assessmentType,
            score: latestRecord.score,
            maxScore: latestRecord.maxScore,
            percentage: latestRecord.percentage,
            examDate: latestRecord.examDate,
          }
          : null,
      };
    })
    .sort((left, right) => {
      const leftValue = left.averagePercentage ?? -1;
      const rightValue = right.averagePercentage ?? -1;
      return rightValue - leftValue;
    });

  const averagePercentage = normalizedRecords.length
    ? roundMetric(normalizedRecords.reduce((sum, record) => sum + record.percentage, 0) / normalizedRecords.length)
    : null;

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
          academicYear: student.classId.academicYear,
        }
        : null,
    },
    overview: {
      totalAssessments: normalizedRecords.length,
      subjectsCount: subjects.length,
      passingSubjects: subjects.filter((item) => (item.averagePercentage ?? -1) >= PASSING_PERCENTAGE).length,
      averagePercentage,
      academicLevel: averagePercentage !== null ? getAcademicLevel(averagePercentage) : null,
    },
    subjects,
    recentAssessments: normalizedRecords.slice(0, 8).map((record) => ({
      _id: record._id,
      title: record.title,
      assessmentType: record.assessmentType,
      score: record.score,
      maxScore: record.maxScore,
      percentage: record.percentage,
      examDate: record.examDate,
      subject: record.subjectId && typeof record.subjectId === 'object'
        ? {
          _id: record.subjectId._id,
          name: record.subjectId.name,
          nameAr: record.subjectId.nameAr || null,
        }
        : null,
    })),
  };
};

const gradeReport = async (query, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher']);

  const { filter, range } = await buildScopedFilter(query, schoolId, requester);
  const gradeRecords = await populateGradeQuery(Grade.find(filter).sort({ examDate: -1, createdAt: -1 })).lean();
  const normalizedRecords = gradeRecords.map(mapGradeRecord);

  const subjectMap = new Map();
  const studentMap = new Map();
  const typeMap = new Map();

  normalizedRecords.forEach((record) => {
    const subjectKey = String(record.subjectId?._id || record.subjectId || 'unknown');
    const studentKey = String(record.studentId?._id || record.studentId || 'unknown');

    if (!subjectMap.has(subjectKey)) {
      subjectMap.set(subjectKey, {
        subject: record.subjectId && typeof record.subjectId === 'object'
          ? {
            _id: record.subjectId._id,
            name: record.subjectId.name,
            nameAr: record.subjectId.nameAr || null,
            code: record.subjectId.code || null,
          }
          : null,
        totalPercentage: 0,
        assessmentCount: 0,
        passingCount: 0,
      });
    }

    const subjectEntry = subjectMap.get(subjectKey);
    subjectEntry.totalPercentage += record.percentage;
    subjectEntry.assessmentCount += 1;
    if (record.percentage >= PASSING_PERCENTAGE) subjectEntry.passingCount += 1;

    if (!studentMap.has(studentKey)) {
      studentMap.set(studentKey, {
        student: record.studentId && typeof record.studentId === 'object'
          ? {
            _id: record.studentId._id,
            name: record.studentId.userId?.name || null,
            nationalId: record.studentId.nationalId || null,
          }
          : null,
        class: record.classId && typeof record.classId === 'object'
          ? {
            _id: record.classId._id,
            name: record.classId.name,
            grade: record.classId.grade,
            section: record.classId.section,
          }
          : null,
        totalPercentage: 0,
        assessmentCount: 0,
        subjects: new Set(),
      });
    }

    const studentEntry = studentMap.get(studentKey);
    studentEntry.totalPercentage += record.percentage;
    studentEntry.assessmentCount += 1;
    studentEntry.subjects.add(subjectKey);

    typeMap.set(record.assessmentType, (typeMap.get(record.assessmentType) || 0) + 1);
  });

  const averagePercentage = normalizedRecords.length
    ? roundMetric(normalizedRecords.reduce((sum, record) => sum + record.percentage, 0) / normalizedRecords.length)
    : 0;
  const successRate = normalizedRecords.length
    ? roundMetric((normalizedRecords.filter((record) => record.percentage >= PASSING_PERCENTAGE).length / normalizedRecords.length) * 100)
    : 0;

  return {
    period: range
      ? { startDate: range.startDateLabel, endDate: range.endDateLabel }
      : null,
    summary: {
      totalAssessments: normalizedRecords.length,
      averagePercentage,
      successRate,
      totalSubjects: subjectMap.size,
      totalStudents: studentMap.size,
    },
    subjectBreakdown: Array.from(subjectMap.values())
      .map((entry) => ({
        subject: entry.subject,
        assessmentCount: entry.assessmentCount,
        averagePercentage: entry.assessmentCount ? roundMetric(entry.totalPercentage / entry.assessmentCount) : 0,
        successRate: entry.assessmentCount ? roundMetric((entry.passingCount / entry.assessmentCount) * 100) : 0,
      }))
      .sort((left, right) => right.averagePercentage - left.averagePercentage),
    studentBreakdown: Array.from(studentMap.values())
      .map((entry) => ({
        student: entry.student,
        class: entry.class,
        assessmentCount: entry.assessmentCount,
        subjectsCount: entry.subjects.size,
        averagePercentage: entry.assessmentCount ? roundMetric(entry.totalPercentage / entry.assessmentCount) : 0,
        academicLevel: getAcademicLevel(entry.assessmentCount ? entry.totalPercentage / entry.assessmentCount : 0),
      }))
      .sort((left, right) => right.averagePercentage - left.averagePercentage),
    assessmentTypeBreakdown: Array.from(typeMap.entries()).map(([type, count]) => ({ type, count })),
    recentAssessments: normalizedRecords.slice(0, 12).map((record) => ({
      _id: record._id,
      title: record.title,
      assessmentType: record.assessmentType,
      score: record.score,
      maxScore: record.maxScore,
      percentage: record.percentage,
      examDate: record.examDate,
      student: record.studentId && typeof record.studentId === 'object'
        ? {
          _id: record.studentId._id,
          name: record.studentId.userId?.name || null,
        }
        : null,
      subject: record.subjectId && typeof record.subjectId === 'object'
        ? {
          _id: record.subjectId._id,
          name: record.subjectId.name,
          nameAr: record.subjectId.nameAr || null,
        }
        : null,
      class: record.classId && typeof record.classId === 'object'
        ? {
          _id: record.classId._id,
          name: record.classId.name,
          grade: record.classId.grade,
        }
        : null,
    })),
  };
};

module.exports = {
  listGrades,
  getGradeById,
  createGrade,
  updateGrade,
  deleteGrade,
  getStudentGradeProfile,
  gradeReport,
};