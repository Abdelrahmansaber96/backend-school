const XLSX = require('xlsx');
const Class = require('../models/Class.model');
const Student = require('../models/Student.model');
const Teacher = require('../models/Teacher.model');
const ApiError = require('../utils/ApiError');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');
const { getTeacherScope, ensureTeacherClassAccess, ensureSchoolReference } = require('../utils/accessScope');
const { assertRequesterRole } = require('../utils/authorization');
const { getCurrentHijriAcademicYear } = require('../utils/academicYear');

const ARABIC_INDIC_DIGITS = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

const normalizeArabicDigits = (value) => String(value || '').replace(/[٠-٩]/g, (digit) => ARABIC_INDIC_DIGITS[digit] || digit);

const normalizeImportHeader = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s._-]+/g, '');

const normalizeLookupValue = (value) => normalizeArabicDigits(value)
  .trim()
  .toLowerCase()
  .replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/[\s_\-/()]+/g, '');

const extractImportRows = (file) => {
  const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true, raw: false });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new ApiError(400, 'Import file must contain at least one sheet');
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    defval: '',
    raw: false,
    blankrows: false,
  });

  return rows.map((row, index) => ({ rowNumber: index + 2, row }));
};

const normalizeAcademicYearValue = (value) => {
  const normalized = normalizeArabicDigits(value).trim().replace(/\s+/g, '');

  if (!normalized) {
    return getCurrentHijriAcademicYear();
  }

  const rangeMatch = normalized.match(/^(\d{4})[-/](\d{4})$/);
  if (rangeMatch) {
    return `${rangeMatch[1]}-${rangeMatch[2]}`;
  }

  const startYearMatch = normalized.match(/^(\d{4})$/);
  if (startYearMatch) {
    const startYear = Number.parseInt(startYearMatch[1], 10);
    return `${startYear}-${startYear + 1}`;
  }

  return '';
};

const parseCapacityValue = (value) => {
  const normalized = normalizeArabicDigits(value).trim();

  if (!normalized) {
    return { value: null, error: null };
  }

  if (!/^\d+$/.test(normalized)) {
    return { value: null, error: 'capacity must be a number' };
  }

  const parsed = Number.parseInt(normalized, 10);
  if (parsed < 1 || parsed > 100) {
    return { value: null, error: 'capacity must be between 1 and 100' };
  }

  return { value: parsed, error: null };
};

const normalizeImportRow = ({ rowNumber, row }) => {
  const normalized = { rowNumber, raw: row };

  Object.entries(row).forEach(([key, value]) => {
    const header = normalizeImportHeader(key);

    if (['name', 'classname', 'class', 'اسمالفصل', 'الفصل'].includes(header)) normalized.name = String(value || '').trim();
    if (['grade', 'stage', 'الصف', 'المرحلة'].includes(header)) normalized.grade = String(value || '').trim();
    if (['section', 'division', 'classsection', 'الشعبة'].includes(header)) normalized.section = String(value || '').trim();
    if (['academicyear', 'schoolyear', 'العامالدراسي', 'السنةالدراسية'].includes(header)) normalized.academicYear = String(value || '').trim();
    if (['capacity', 'classcapacity', 'السعة', 'الطاقةالاستيعابية'].includes(header)) normalized.capacity = value;
  });

  return normalized;
};

const buildImportedClassName = (row) => {
  const explicitName = String(row.name || '').trim();
  if (explicitName) {
    return explicitName;
  }

  return [String(row.grade || '').trim(), String(row.section || '').trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
};

const buildImportError = (rowNumber, message, row) => ({ row: rowNumber, message, data: row });

const buildClassImportKey = (name, academicYear) => `${academicYear}::${normalizeLookupValue(name)}`;

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

const importClasses = async (file, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  if (!file) {
    throw new ApiError(400, 'Import file is required');
  }

  const rows = extractImportRows(file);
  if (!rows.length) {
    throw new ApiError(400, 'Import file does not contain any rows');
  }

  const normalizedRows = rows.map(normalizeImportRow).map((row) => {
    const capacityResult = parseCapacityValue(row.capacity);

    return {
      ...row,
      name: buildImportedClassName(row),
      grade: String(row.grade || '').trim(),
      section: String(row.section || '').trim(),
      academicYear: normalizeAcademicYearValue(row.academicYear),
      capacity: capacityResult.value,
      capacityError: capacityResult.error,
    };
  });

  const requestedAcademicYears = [...new Set(normalizedRows.map((row) => row.academicYear).filter(Boolean))];
  const existingClasses = requestedAcademicYears.length
    ? await Class.find({
      schoolId,
      academicYear: { $in: requestedAcademicYears },
      isDeleted: false,
    }).select('name academicYear').lean()
    : [];

  const existingKeys = new Set(existingClasses.map((cls) => buildClassImportKey(cls.name, cls.academicYear)));
  const fileKeys = new Set();
  const created = [];
  const errors = [];

  for (const row of normalizedRows) {
    const rowErrors = [];
    const importKey = row.name && row.academicYear ? buildClassImportKey(row.name, row.academicYear) : null;

    if (!row.name) rowErrors.push('class name is required or can be derived from grade and section');
    if (!row.grade) rowErrors.push('grade is required');
    if (!row.academicYear) rowErrors.push('academicYear is invalid');
    if (row.capacityError) rowErrors.push(row.capacityError);
    if (importKey && fileKeys.has(importKey)) rowErrors.push('class is duplicated inside the import file');
    if (importKey && existingKeys.has(importKey)) rowErrors.push('class already exists for this academic year');

    if (rowErrors.length) {
      errors.push(buildImportError(row.rowNumber, rowErrors.join('; '), row.raw));
      continue;
    }

    try {
      const cls = await createClass({
        name: row.name,
        grade: row.grade,
        section: row.section || undefined,
        academicYear: row.academicYear,
        capacity: row.capacity === null ? undefined : row.capacity,
      }, schoolId, requester);

      created.push({
        row: row.rowNumber,
        classId: String(cls._id),
        name: cls.name,
        grade: cls.grade,
        section: cls.section,
        academicYear: cls.academicYear,
      });

      if (importKey) {
        fileKeys.add(importKey);
        existingKeys.add(importKey);
      }
    } catch (error) {
      errors.push(buildImportError(row.rowNumber, error.message, row.raw));
    }
  }

  return {
    summary: {
      totalRows: normalizedRows.length,
      importedCount: created.length,
      errorCount: errors.length,
    },
    created,
    errors,
  };
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

module.exports = {
  listClasses,
  getClassById,
  createClass,
  importClasses,
  updateClass,
  deleteClass,
  getClassStudents,
  __testables: {
    normalizeAcademicYearValue,
    buildImportedClassName,
  },
};
