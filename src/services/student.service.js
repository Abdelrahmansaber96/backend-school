const XLSX = require('xlsx');
const Student = require('../models/Student.model');
const User = require('../models/User.model');
const Class = require('../models/Class.model');
const Parent = require('../models/Parent.model');
const School = require('../models/School.model');
const ApiError = require('../utils/ApiError');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');
const {
  getTeacherScope,
  ensureSchoolReference,
  ensureTeacherClassAccess,
  ensureTeacherStudentAccess,
  getParentScope,
  ensureParentStudentAccess,
  getStudentScope,
} = require('../utils/accessScope');
const { assertRequesterRole } = require('../utils/authorization');
const { toObjectId, toObjectIds, escapeRegex } = require('../utils/mongo');
const auditLogger = require('../utils/auditLogger');
const notificationService = require('./notification.service');
const { createClass: createClassService } = require('./class.service');
const { generateTempPassword } = require('../utils/password');
const { getCurrentHijriAcademicYear } = require('../utils/academicYear');

const IMPORT_SPECIAL_STATUS = new Set(['orphan', 'health_condition', 'learning_difficulty']);
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
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
const GRADE_DISPLAY_LABELS = new Map([
  ['1', 'الأول الابتدائي'],
  ['2', 'الثاني الابتدائي'],
  ['3', 'الثالث الابتدائي'],
  ['4', 'الرابع الابتدائي'],
  ['5', 'الخامس الابتدائي'],
  ['6', 'السادس الابتدائي'],
  ['7', 'الأول المتوسط'],
  ['8', 'الثاني المتوسط'],
  ['9', 'الثالث المتوسط'],
  ['10', 'الأول الثانوي'],
  ['11', 'الثاني الثانوي'],
  ['12', 'الثالث الثانوي'],
]);
const HIJRI_DATE_FORMATTER = new Intl.DateTimeFormat('en-u-ca-islamic', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const STUDENT_ROSTER_HEADER_ROW = 20;
const STUDENT_ROSTER_FIRST_DATA_ROW = 21;
const STUDENT_ROSTER_STATIC_MERGES = [
  'AA1:AE2',
  'AA7:AE7',
  'AA11:AE11',
  'E3:G3',
  'K3:L3',
  'E5:G5',
  'K5:L5',
  'E9:G9',
  'K9:L9',
  'E13:G13',
  'K13:L13',
  'R17:V17',
  'C20:E20',
  'F20:H20',
  'I20:L20',
  'M20:N20',
  'Q20:R20',
  'U20:W20',
  'Z20:AA20',
  'AD20:AE20',
];
const STUDENT_ROSTER_ROW_MERGES = [
  ['C', 'E'],
  ['F', 'H'],
  ['I', 'L'],
  ['M', 'N'],
  ['Q', 'R'],
  ['U', 'W'],
  ['Z', 'AA'],
  ['AD', 'AE'],
];
const STUDENT_ROSTER_COLUMNS = (() => {
  const columns = Array.from({ length: 31 }, () => ({ wch: 4 }));

  [2, 3, 4].forEach((index) => { columns[index] = { wch: 7 }; });
  [5, 6, 7].forEach((index) => { columns[index] = { wch: 8 }; });
  [8, 9, 10, 11].forEach((index) => { columns[index] = { wch: 9 }; });
  [12, 13].forEach((index) => { columns[index] = { wch: 8 }; });
  columns[15] = { wch: 8 };
  [16, 17].forEach((index) => { columns[index] = { wch: 10 }; });
  columns[18] = { wch: 7 };
  columns[19] = { wch: 8 };
  [20, 21, 22].forEach((index) => { columns[index] = { wch: 7 }; });
  columns[23] = { wch: 8 };
  columns[24] = { wch: 10 };
  [25, 26].forEach((index) => { columns[index] = { wch: 8 }; });
  columns[27] = { wch: 10 };
  columns[28] = { wch: 18 };
  [29, 30].forEach((index) => { columns[index] = { wch: 5 }; });

  return columns;
})();
const GRADE_ALIAS_MAP = new Map([
  ['اول', '1'],
  ['الاول', '1'],
  ['first', '1'],
  ['ثاني', '2'],
  ['الثاني', '2'],
  ['second', '2'],
  ['ثالث', '3'],
  ['الثالث', '3'],
  ['third', '3'],
  ['رابع', '4'],
  ['الرابع', '4'],
  ['fourth', '4'],
  ['خامس', '5'],
  ['الخامس', '5'],
  ['fifth', '5'],
  ['سادس', '6'],
  ['السادس', '6'],
  ['sixth', '6'],
  ['سابع', '7'],
  ['السابع', '7'],
  ['seventh', '7'],
  ['ثامن', '8'],
  ['الثامن', '8'],
  ['eighth', '8'],
  ['تاسع', '9'],
  ['التاسع', '9'],
  ['ninth', '9'],
  ['عاشر', '10'],
  ['العاشر', '10'],
  ['tenth', '10'],
]);
const SECTION_ALIAS_MAP = new Map([
  ['ا', 'a'],
  ['الف', 'a'],
  ['a', 'a'],
  ['ب', 'b'],
  ['باء', 'b'],
  ['b', 'b'],
  ['ج', 'c'],
  ['جيم', 'c'],
  ['c', 'c'],
  ['د', 'd'],
  ['دال', 'd'],
  ['d', 'd'],
  ['ه', 'e'],
  ['هـ', 'e'],
  ['e', 'e'],
  ['و', 'f'],
  ['واو', 'f'],
  ['f', 'f'],
]);

const normalizeArabicDigits = (value) => String(value || '').replace(/[٠-٩]/g, (digit) => ARABIC_INDIC_DIGITS[digit] || digit);

const normalizeImportHeader = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/[\s._-]+/g, '');

const normalizeLookupValue = (value) => normalizeArabicDigits(value)
  .trim()
  .toLowerCase()
  .replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/[\s_\-/()]+/g, '');

const normalizeGradeValue = (value) => {
  const normalized = normalizeLookupValue(value);
  if (!normalized) return '';

  const alias = GRADE_ALIAS_MAP.get(normalized);
  if (alias) return alias;

  const digitMatch = normalized.match(/\d+/);
  if (digitMatch) {
    return String(Number.parseInt(digitMatch[0], 10));
  }

  return normalized;
};

const normalizeSectionValue = (value) => {
  const normalized = normalizeLookupValue(value);
  if (!normalized) return '';
  return SECTION_ALIAS_MAP.get(normalized) || normalized;
};

const findClassForImportRow = (classes, row) => {
  const classRef = row.classRef || '';
  if (!classRef) return null;

  const rowClassKey = normalizeLookupValue(classRef);
  const rowGradeKey = normalizeGradeValue(row.gradeRef);
  const rowSectionKey = normalizeSectionValue(classRef);

  return classes.find((item) => {
    const itemNameKey = normalizeLookupValue(item.name);
    const itemGradeKey = normalizeGradeValue(item.grade);
    const itemSectionKey = normalizeSectionValue(item.section);
    const gradeMatches = !rowGradeKey || !itemGradeKey || itemGradeKey === rowGradeKey;

    if (gradeMatches && itemNameKey === rowClassKey) return true;
    if (gradeMatches && rowSectionKey && itemSectionKey && itemSectionKey === rowSectionKey) return true;
    if (rowGradeKey && rowSectionKey && itemGradeKey === rowGradeKey && itemNameKey.endsWith(normalizeLookupValue(classRef))) return true;
    if (rowGradeKey && rowSectionKey && itemGradeKey === rowGradeKey && itemSectionKey === rowSectionKey) return true;
    if (rowGradeKey && rowClassKey) {
      const rowComposite = normalizeLookupValue(`${rowGradeKey}${classRef}`);
      if (normalizeLookupValue(`${itemGradeKey}${itemSectionKey || ''}`) === rowComposite) return true;
      if (normalizeLookupValue(`${itemGradeKey}${itemNameKey}`) === rowComposite) return true;
    }

    return false;
  }) || null;
};

const isSectionLikeValue = (value) => {
  const normalized = normalizeLookupValue(value);
  return Boolean(normalized) && SECTION_ALIAS_MAP.has(normalized);
};

const extractSectionFromClassRef = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (isSectionLikeValue(raw)) {
    return raw;
  }

  const parts = raw.split(/\s+/).filter(Boolean);
  const lastPart = parts[parts.length - 1] || '';
  return isSectionLikeValue(lastPart) ? lastPart : '';
};

const buildImportedClassName = (row) => {
  const classRef = String(row.classRef || '').trim();
  const gradeRef = String(row.gradeRef || '').trim();

  if (classRef) {
    if (gradeRef && isSectionLikeValue(classRef)) {
      return `${gradeRef} ${classRef}`.trim();
    }

    return classRef;
  }

  return gradeRef;
};

const resolveImportedClassGrade = (row) => {
  const gradeFromGradeRef = normalizeGradeValue(row.gradeRef);
  if (gradeFromGradeRef) {
    return gradeFromGradeRef;
  }

  const classRef = String(row.classRef || '').trim();
  if (!classRef || isSectionLikeValue(classRef)) {
    return '';
  }

  return normalizeGradeValue(classRef);
};

const buildImportedClassPayload = (row) => {
  const classRef = String(row.classRef || '').trim();
  const gradeRef = String(row.gradeRef || '').trim();

  if (!classRef && !gradeRef) {
    return null;
  }

  if (OBJECT_ID_PATTERN.test(classRef)) {
    return null;
  }

  const name = buildImportedClassName(row);
  const grade = resolveImportedClassGrade(row) || normalizeArabicDigits(gradeRef).trim();

  if (!name || !grade) {
    return null;
  }

  return {
    name,
    grade,
    section: extractSectionFromClassRef(classRef) || undefined,
    academicYear: getCurrentHijriAcademicYear(),
  };
};

const findClassByImportPayload = (classes, payload) => {
  if (!payload) return null;

  const nameKey = normalizeLookupValue(payload.name);
  const gradeKey = normalizeGradeValue(payload.grade);
  const sectionKey = normalizeSectionValue(payload.section);

  return classes.find((item) => {
    const itemNameKey = normalizeLookupValue(item.name);
    const itemGradeKey = normalizeGradeValue(item.grade);
    const itemSectionKey = normalizeSectionValue(item.section);

    if (itemNameKey !== nameKey || itemGradeKey !== gradeKey) {
      return false;
    }

    if (!sectionKey || !itemSectionKey) {
      return true;
    }

    return itemSectionKey === sectionKey;
  }) || null;
};

const registerImportedClass = (classes, classesById, cls) => {
  const normalizedClass = {
    _id: String(cls._id),
    name: cls.name,
    grade: cls.grade,
    section: cls.section || null,
  };

  classes.push(normalizedClass);
  classesById.set(normalizedClass._id, normalizedClass);
  return normalizedClass;
};

const resolveClassForImportedStudent = async ({ classes, classesById, row, schoolId, requester }) => {
  const classRef = String(row.classRef || '').trim();
  const hasClassInfo = Boolean(classRef || String(row.gradeRef || '').trim());

  if (!hasClassInfo) {
    return { resolvedClass: null, autoCreated: false };
  }

  if (OBJECT_ID_PATTERN.test(classRef)) {
    return {
      resolvedClass: classesById.get(classRef) || null,
      autoCreated: false,
    };
  }

  const existingClass = findClassForImportRow(classes, row);
  if (existingClass) {
    return { resolvedClass: existingClass, autoCreated: false };
  }

  const importedClassPayload = buildImportedClassPayload(row);
  const draftMatch = findClassByImportPayload(classes, importedClassPayload);
  if (draftMatch) {
    return { resolvedClass: draftMatch, autoCreated: false };
  }

  if (!importedClassPayload) {
    return { resolvedClass: null, autoCreated: false };
  }

  try {
    const createdClass = await createClassService(importedClassPayload, schoolId, requester);
    return {
      resolvedClass: registerImportedClass(classes, classesById, createdClass),
      autoCreated: true,
    };
  } catch (error) {
    if (error?.statusCode === 409) {
      const conflictMatch = findClassByImportPayload(classes, importedClassPayload);
      if (conflictMatch) {
        return { resolvedClass: conflictMatch, autoCreated: false };
      }
    }

    throw error;
  }
};

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

const normalizeImportRow = ({ rowNumber, row }) => {
  const normalized = {
    rowNumber,
    raw: row,
  };

  Object.entries(row).forEach(([key, value]) => {
    const header = normalizeImportHeader(key);

    if (['nationalid', 'studentnationalid', 'nationalnumber', 'رقمالهوية', 'الهوية', 'هويةالطالب'].includes(header)) normalized.nationalId = String(value || '').trim();
    if (['firstname', 'studentfirstname', 'namefirst', 'الاسمالاول', 'اسمالاول'].includes(header)) normalized.firstName = String(value || '').trim();
    if (['lastname', 'studentlastname', 'namelast', 'اسمالعائلة', 'الاسمالاخير'].includes(header)) normalized.lastName = String(value || '').trim();
    if (['fullname', 'name', 'studentname', 'studentfullname', 'الاسم', 'اسمالطالب', 'اسمكامل'].includes(header)) normalized.fullName = String(value || '').trim();
    if (['phone', 'studentphone', 'mobilenumber', 'الجوال', 'رقمالجوال', 'هاتف'].includes(header)) normalized.phone = String(value || '').trim();
    if (['additionalphone', 'secondaryphone', 'alternatephone', 'emergencyphone', 'رقمجوالاضافي', 'رقمالجوالاضافي', 'رقمالجوالالثاني', 'جوالاضافي'].includes(header)) normalized.additionalPhone = String(value || '').trim();
    if (['relationship', 'relation', 'kinship', 'emergencyrelationship', 'صلةالقرابة', 'القرابة', 'صلةالقريب'].includes(header)) normalized.additionalPhoneRelationship = String(value || '').trim();
    if (['classid', 'classname', 'class', 'classcode', 'الفصل', 'اسمالفصل', 'الفصلالدراسي'].includes(header)) normalized.classRef = String(value || '').trim();
    if (['grade', 'stage', 'الصف', 'المرحلة'].includes(header)) normalized.gradeRef = String(value || '').trim();
    if (['parentid', 'parentnationalid', 'parentnationalnumber', 'parent', 'هويةوليالامر', 'وليالامر'].includes(header)) normalized.parentRef = String(value || '').trim();
    if (['gender', 'sex', 'الجنس'].includes(header)) normalized.gender = String(value || '').trim().toLowerCase();
    if (['dateofbirth', 'dob', 'birthdate', 'تاريخالميلاد'].includes(header)) normalized.dateOfBirth = value;
    if (['healthstatus', 'medicalnotes'].includes(header)) normalized.healthStatus = String(value || '').trim();
    if (['specialstatus', 'specialstatuses'].includes(header)) normalized.specialStatus = value;
  });

  return normalized;
};

const parseSpecialStatus = (value) => {
  if (!value) return { values: [], invalid: [] };

  const parts = Array.isArray(value)
    ? value
    : String(value)
      .split(/[|,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);

  const normalized = [...new Set(parts.map((item) => String(item).trim().toLowerCase()))];
  const invalid = normalized.filter((item) => !IMPORT_SPECIAL_STATUS.has(item));

  return { values: normalized.filter((item) => IMPORT_SPECIAL_STATUS.has(item)), invalid };
};

const parseDateValue = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildImportError = (rowNumber, message, row) => ({ row: rowNumber, message, data: row });

const splitImportedName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return { first: '', last: '' };
  }

  if (parts.length === 1) {
    return { first: parts[0], last: parts[0] };
  }

  return {
    first: parts[0],
    last: parts.slice(1).join(' '),
  };
};

const resolveImportedStudentName = (row) => {
  const first = String(row.firstName || '').trim();
  const last = String(row.lastName || '').trim();

  if (first || last) {
    return { first, last };
  }

  return splitImportedName(row.fullName);
};

const getUserFullName = (user) => [user?.name?.first, user?.name?.last].filter(Boolean).join(' ').trim();

const formatHijriDate = (value) => {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const parts = HIJRI_DATE_FORMATTER.formatToParts(date);
  const day = parts.find((part) => part.type === 'day')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const year = parts.find((part) => part.type === 'year')?.value || '';

  if (!day || !month || !year) {
    return '';
  }

  return `${day}/${month}/${year}`;
};

const getGradeDisplayLabel = (grade) => {
  const normalizedGrade = normalizeGradeValue(grade);
  return GRADE_DISPLAY_LABELS.get(normalizedGrade) || String(grade || '').trim() || 'غير محدد';
};

const getRosterGradeSortKey = (grade) => {
  const normalizedGrade = normalizeGradeValue(grade);
  const numericGrade = Number.parseInt(normalizedGrade, 10);
  return Number.isNaN(numericGrade) ? Number.MAX_SAFE_INTEGER : numericGrade;
};

const sanitizeSheetName = (value) => String(value || '')
  .replace(/[\\/?*\[\]:]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const buildRosterSheetName = (group, sheetIndex, usedNames) => {
  const baseName = sanitizeSheetName([
    group.grade ? getGradeDisplayLabel(group.grade) : '',
    group.className || 'بدون فصل',
  ].filter(Boolean).join(' - ')) || `كشف الطلاب ${sheetIndex + 1}`;

  let candidate = baseName.slice(0, 31);
  let suffixIndex = 2;

  while (usedNames.has(candidate)) {
    const suffix = ` (${suffixIndex})`;
    candidate = `${baseName.slice(0, Math.max(0, 31 - suffix.length))}${suffix}`;
    suffixIndex += 1;
  }

  usedNames.add(candidate);
  return candidate;
};

const setSheetValue = (sheet, address, value) => {
  sheet[address] = { t: 's', v: String(value ?? '') };
};

const buildStudentRosterGroups = (students) => {
  const groups = new Map();

  students.forEach((student) => {
    const classKey = student.classId?._id ? String(student.classId._id) : '__unassigned__';
    if (!groups.has(classKey)) {
      groups.set(classKey, {
        key: classKey,
        className: student.classId?.name || 'بدون فصل',
        grade: student.classId?.grade || '',
        section: student.classId?.section || '',
        students: [],
      });
    }

    groups.get(classKey).students.push(student);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      students: [...group.students].sort((left, right) => {
        const leftName = getUserFullName(left.userId);
        const rightName = getUserFullName(right.userId);
        return leftName.localeCompare(rightName, 'ar-SA')
          || String(left.nationalId || '').localeCompare(String(right.nationalId || ''), 'ar-SA');
      }),
    }))
    .sort((left, right) => (
      getRosterGradeSortKey(left.grade) - getRosterGradeSortKey(right.grade)
      || String(left.className || '').localeCompare(String(right.className || ''), 'ar-SA')
      || String(left.section || '').localeCompare(String(right.section || ''), 'ar-SA')
    ));
};

const buildStudentRosterWorkbookBuffer = ({ school, students }) => {
  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };

  const groups = buildStudentRosterGroups(students);
  const usedSheetNames = new Set();

  groups.forEach((group, sheetIndex) => {
    const sheet = {};
    const merges = STUDENT_ROSTER_STATIC_MERGES.map((range) => XLSX.utils.decode_range(range));
    const schoolName = school?.nameAr || school?.name || 'المدرسة';
    const schoolAddress = school?.address || 'إدارة التعليم';
    const academicYear = group.students[0]?.classId?.academicYear || school?.academicYear || getCurrentHijriAcademicYear();
    const lastRow = Math.max(STUDENT_ROSTER_FIRST_DATA_ROW, STUDENT_ROSTER_FIRST_DATA_ROW + group.students.length - 1);

    setSheetValue(sheet, 'AA1', 'المملكة العربية السعودية\nوزارة التعليم');
    setSheetValue(sheet, 'AA7', schoolAddress);
    setSheetValue(sheet, 'AA11', schoolName);
    setSheetValue(sheet, 'E3', academicYear);
    setSheetValue(sheet, 'H3', ':');
    setSheetValue(sheet, 'K3', 'العام الدراسي');
    setSheetValue(sheet, 'E5', getGradeDisplayLabel(group.grade));
    setSheetValue(sheet, 'H5', ':');
    setSheetValue(sheet, 'L5', 'الصف');
    setSheetValue(sheet, 'E9', group.section || group.className || 'غير محدد');
    setSheetValue(sheet, 'H9', ':');
    setSheetValue(sheet, 'L9', 'القسم');
    setSheetValue(sheet, 'E13', group.className || 'بدون فصل');
    setSheetValue(sheet, 'H13', ':');
    setSheetValue(sheet, 'L13', 'الفصل');
    setSheetValue(sheet, 'R17', 'كشف الطلاب');

    [
      ['C20', 'رقم جوال الطالب'],
      ['F20', 'عنوان القريب'],
      ['I20', 'اسم قريب الطالب'],
      ['M20', 'هاتف العمل'],
      ['P20', 'هاتف المنزل'],
      ['Q20', 'إسم ولي الامر'],
      ['S20', 'الفصل'],
      ['T20', 'تاريخ رخصة الاقامة'],
      ['U20', 'رقم رخصة الاقامة'],
      ['X20', 'الجنسية'],
      ['Y20', 'تاريخ الميلاد'],
      ['Z20', 'مكان الميلاد'],
      ['AB20', 'حالة القيد'],
      ['AC20', 'اسم الطالب'],
      ['AD20', 'م'],
    ].forEach(([address, value]) => setSheetValue(sheet, address, value));

    group.students.forEach((student, index) => {
      const rowNumber = STUDENT_ROSTER_FIRST_DATA_ROW + index;
      const parentName = getUserFullName(student.parentId?.userId);
      const parentPhone = student.parentId?.userId?.phone || '';
      const parentAddress = student.parentId?.address || '';

      STUDENT_ROSTER_ROW_MERGES.forEach(([startColumn, endColumn]) => {
        merges.push(XLSX.utils.decode_range(`${startColumn}${rowNumber}:${endColumn}${rowNumber}`));
      });

      setSheetValue(sheet, `C${rowNumber}`, student.userId?.phone || '');
      setSheetValue(sheet, `F${rowNumber}`, parentAddress);
      setSheetValue(sheet, `I${rowNumber}`, parentName);
      setSheetValue(sheet, `M${rowNumber}`, '');
      setSheetValue(sheet, `P${rowNumber}`, parentPhone);
      setSheetValue(sheet, `Q${rowNumber}`, parentName);
      setSheetValue(sheet, `S${rowNumber}`, student.classId?.name || group.className || '');
      setSheetValue(sheet, `T${rowNumber}`, '');
      setSheetValue(sheet, `U${rowNumber}`, student.nationalId || '');
      setSheetValue(sheet, `X${rowNumber}`, '');
      setSheetValue(sheet, `Y${rowNumber}`, formatHijriDate(student.dateOfBirth));
      setSheetValue(sheet, `Z${rowNumber}`, '');
      setSheetValue(sheet, `AB${rowNumber}`, student.userId?.isActive === false || student.isActive === false ? 'غير نشط' : 'مستمر في الدراسة');
      setSheetValue(sheet, `AC${rowNumber}`, getUserFullName(student.userId));
      setSheetValue(sheet, `AD${rowNumber}`, index + 1);
    });

    sheet['!cols'] = STUDENT_ROSTER_COLUMNS;
    sheet['!merges'] = merges;
    sheet['!ref'] = `C1:AE${lastRow}`;

    XLSX.utils.book_append_sheet(workbook, sheet, buildRosterSheetName(group, sheetIndex, usedSheetNames));
  });

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const buildLookupStages = (from, localField, as, project) => [
  {
    $lookup: {
      from,
      let: { localId: `$${localField}` },
      pipeline: [
        { $match: { $expr: { $eq: ['$_id', '$$localId'] } } },
        { $project: project },
      ],
      as,
    },
  },
  { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
];

const STUDENT_LIST_PROJECTION = {
  _id: 1,
  schoolId: 1,
  nationalId: 1,
  dateOfBirth: 1,
  gender: 1,
  healthStatus: 1,
  specialStatus: 1,
  enrollmentDate: 1,
  emergencyContacts: 1,
  isActive: 1,
  createdAt: 1,
  updatedAt: 1,
  userId: {
    $cond: [
      { $ifNull: ['$user._id', false] },
      {
        _id: '$user._id',
        name: '$user.name',
        phone: '$user.phone',
        avatar: '$user.avatar',
        isActive: '$user.isActive',
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
        section: '$class.section',
        academicYear: '$class.academicYear',
      },
      null,
    ],
  },
  parentId: {
    $cond: [
      { $ifNull: ['$parent._id', false] },
      {
        _id: '$parent._id',
        address: '$parent.address',
        userId: {
          _id: '$parentUser._id',
          name: '$parentUser.name',
          phone: '$parentUser.phone',
        },
      },
      null,
    ],
  },
};

const buildStudentListContext = async (query, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher']);

  const sort = getSorting(query, ['createdAt', 'nationalId']);
  const filter = { isDeleted: false };
  if (schoolId) filter.schoolId = toObjectId(schoolId, 'schoolId');
  const searchTerm = typeof query.search === 'string' ? query.search.trim() : '';
  const searchPattern = searchTerm ? new RegExp(escapeRegex(searchTerm), 'i') : null;

  let teacherScope = null;
  if (requester.role === 'teacher') {
    teacherScope = await getTeacherScope(requester.userId, schoolId);
  }

  if (query.classId) {
    if (teacherScope) ensureTeacherClassAccess(query.classId, teacherScope);
    filter.classId = toObjectId(query.classId, 'classId');
  } else if (teacherScope) {
    filter.classId = { $in: toObjectIds(teacherScope.classIds, 'classId') };
  }

  if (query.parentId) filter.parentId = toObjectId(query.parentId, 'parentId');
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.gender) filter.gender = query.gender;

  const userLookupStages = buildLookupStages('users', 'userId', 'user', {
    _id: 1,
    name: 1,
    phone: 1,
    avatar: 1,
    isActive: 1,
  });
  const classLookupStages = buildLookupStages('classes', 'classId', 'class', {
    _id: 1,
    name: 1,
    grade: 1,
    section: 1,
    academicYear: 1,
  });
  const parentLookupStages = [
    ...buildLookupStages('parents', 'parentId', 'parent', { _id: 1, userId: 1, address: 1 }),
    ...buildLookupStages('users', 'parent.userId', 'parentUser', { _id: 1, name: 1, phone: 1 }),
  ];

  const needsUserLookupForFilter = Boolean(searchPattern);
  const needsClassLookupForFilter = Boolean(query.grade);

  return {
    query,
    sort,
    searchPattern,
    userLookupStages,
    classLookupStages,
    parentLookupStages,
    needsUserLookupForFilter,
    needsClassLookupForFilter,
    filterStages: [
      { $match: filter },
      ...(needsUserLookupForFilter ? userLookupStages : []),
      ...(needsClassLookupForFilter ? classLookupStages : []),
      ...(query.grade ? [{ $match: { 'class.grade': query.grade } }] : []),
      ...(searchPattern
        ? [{
          $match: {
            $or: [
              { nationalId: { $regex: searchPattern } },
              { 'user.name.first': { $regex: searchPattern } },
              { 'user.name.last': { $regex: searchPattern } },
            ],
          },
        }]
        : []),
    ],
  };
};

const buildStudentHydrationStages = (context, { skip, limit } = {}) => [
  { $sort: context.sort },
  ...(typeof skip === 'number' ? [{ $skip: skip }] : []),
  ...(typeof limit === 'number' ? [{ $limit: limit }] : []),
  ...(!context.needsUserLookupForFilter ? context.userLookupStages : []),
  ...(!context.needsClassLookupForFilter ? context.classLookupStages : []),
  ...context.parentLookupStages,
  { $project: STUDENT_LIST_PROJECTION },
];

const listStudents = async (query, schoolId, requester = {}) => {
  const { page, limit, skip } = getPagination(query);
  const context = await buildStudentListContext(query, schoolId, requester);

  const pipeline = [
    ...context.filterStages,
    {
      $facet: {
        data: buildStudentHydrationStages(context, { skip, limit }),
        total: [
          { $count: 'count' },
        ],
      },
    },
  ];

  const [result] = await Student.aggregate(pipeline);
  const students = result?.data || [];
  const total = result?.total?.[0]?.count || 0;

  return {
    data: students,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt', 'nationalId'],
    }),
  };
};

const getStudentById = async (studentId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher', 'parent', 'student']);

  const filter = { _id: studentId, schoolId, isDeleted: false };

  if (requester.role === 'student') {
    filter.userId = requester.userId;
  }

  if (requester.role === 'parent') {
    const parentScope = await getParentScope(requester.userId, schoolId);
    await ensureParentStudentAccess(studentId, schoolId, parentScope);
    filter.parentId = parentScope.parentId;
  }

  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    const student = await ensureTeacherStudentAccess(studentId, schoolId, scope);
    filter.classId = student.classId;
  }

  const student = await Student.findOne(filter)
    .populate('userId', 'name phone email avatar isActive lastLogin mustChangePassword')
    .populate('classId', 'name grade section academicYear')
    .populate({ path: 'parentId', populate: { path: 'userId', select: 'name phone email' } });
  if (!student) throw new ApiError(404, 'Student not found');
  return student;
};

const getMyStudentProfile = async (schoolId, requester = {}) => {
  assertRequesterRole(requester, ['student']);

  const scope = await getStudentScope(requester.userId, schoolId);
  return getStudentById(scope.studentId, schoolId, requester);
};

const createStudent = async (data, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const { nationalId, name, phone, classId, parentId, emergencyContacts, gender, dateOfBirth, healthStatus, specialStatus } = data;

  const existing = await User.findOne({ $or: [{ nationalId }, { phone }], isDeleted: false });
  if (existing) throw new ApiError(409, 'National ID or phone already in use');

  const [parent, resolvedClass] = await Promise.all([
    parentId ? ensureSchoolReference(Parent, parentId, schoolId, 'Parent') : Promise.resolve(null),
    classId ? ensureSchoolReference(Class, classId, schoolId, 'Class') : Promise.resolve(null),
  ]);

  const hiddenPassword = generateTempPassword();

  const user = await User.create({
    schoolId, role: 'student', nationalId, phone,
    password: hiddenPassword,
    name, mustChangePassword: true,
  });

  const student = await Student.create({
    userId: user._id,
    schoolId,
    nationalId,
    classId: resolvedClass?._id ?? null,
    parentId: parent?._id ?? null,
    emergencyContacts: emergencyContacts || [],
    gender: gender || 'unspecified',
    dateOfBirth, healthStatus, specialStatus,
  });

  if (parent) {
    await Parent.findByIdAndUpdate(parent._id, { $addToSet: { children: student._id } });
  }

  // Returned only in the creation response; the User model stores a hash, not this value.
  return { student, tempPassword: hiddenPassword };
};

const exportStudents = async (query, schoolId, requester = {}) => {
  const format = String(query.format || 'xlsx').trim().toLowerCase();
  if (format !== 'xlsx') {
    throw new ApiError(400, 'Only xlsx export is supported for student roster');
  }

  const context = await buildStudentListContext(query, schoolId, requester);
  const [students, school] = await Promise.all([
    Student.aggregate([
      ...context.filterStages,
      ...buildStudentHydrationStages(context),
    ]),
    School.findById(schoolId).select('name nameAr address academicYear').lean(),
  ]);

  if (!students.length) {
    throw new ApiError(404, 'No students found for export');
  }

  return {
    format: 'xlsx',
    fileName: `student-roster-${(school?.academicYear || getCurrentHijriAcademicYear()).replace(/\s+/g, '-')}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content: buildStudentRosterWorkbookBuffer({ school, students }),
  };
};

const importStudents = async (file, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  if (!file) {
    throw new ApiError(400, 'Import file is required');
  }

  const rows = extractImportRows(file);
  if (!rows.length) {
    throw new ApiError(400, 'Import file does not contain any rows');
  }

  const [classes, parents] = await Promise.all([
    Class.find({ schoolId, isDeleted: false }).select('_id name grade').lean(),
    Parent.find({ schoolId, isDeleted: false }).select('_id nationalId').lean(),
  ]);

  const classesById = new Map(classes.map((item) => [String(item._id), item]));
  const parentsById = new Map(parents.map((item) => [String(item._id), item]));
  const parentsByNationalId = new Map(parents.map((item) => [String(item.nationalId), item]));

  const normalizedRows = rows.map(normalizeImportRow);
  const fileNationalIds = new Set();
  const filePhones = new Set();

  const requestedNationalIds = normalizedRows.map((row) => row.nationalId).filter(Boolean);
  const requestedPhones = normalizedRows.map((row) => row.phone).filter(Boolean);
  const existingUserFilters = [
    requestedNationalIds.length ? { nationalId: { $in: requestedNationalIds } } : null,
    requestedPhones.length ? { phone: { $in: requestedPhones } } : null,
  ].filter(Boolean);
  const existingUsers = existingUserFilters.length
    ? await User.find({ isDeleted: false, $or: existingUserFilters }).select('nationalId phone').lean()
    : [];

  const existingNationalIds = new Set(existingUsers.map((user) => String(user.nationalId)));
  const existingPhones = new Set(existingUsers.map((user) => String(user.phone)));

  const created = [];
  const errors = [];
  let autoCreatedClassCount = 0;
  let unassignedCount = 0;

  for (const row of normalizedRows) {
    const rowErrors = [];
    const importedName = resolveImportedStudentName(row);
    const hasClassInfo = Boolean(String(row.classRef || '').trim() || String(row.gradeRef || '').trim());

    if (!row.nationalId) rowErrors.push('nationalId is required');
    if (!importedName.first) rowErrors.push('student name is required');
    if (!importedName.last) rowErrors.push('student name is incomplete');
    if (!row.phone) rowErrors.push('phone is required');
    if (row.additionalPhone && !row.additionalPhoneRelationship) {
      rowErrors.push('relationship is required when additionalPhone is provided');
    }
    if (!row.additionalPhone && row.additionalPhoneRelationship) {
      rowErrors.push('additionalPhone is required when relationship is provided');
    }
    if (row.gender && !['male', 'female', 'unspecified'].includes(row.gender)) {
      rowErrors.push('gender must be male, female, or unspecified');
    }

    const parsedDate = parseDateValue(row.dateOfBirth);
    if (row.dateOfBirth && !parsedDate) rowErrors.push('dateOfBirth is invalid');

    const specialStatus = parseSpecialStatus(row.specialStatus);
    if (specialStatus.invalid.length) {
      rowErrors.push(`specialStatus contains invalid values: ${specialStatus.invalid.join(', ')}`);
    }

    const classRef = String(row.classRef || '').trim();
    let resolvedClass = null;
    let autoCreatedClass = false;

    try {
      const classResolution = await resolveClassForImportedStudent({
        classes,
        classesById,
        row,
        schoolId,
        requester,
      });

      resolvedClass = classResolution.resolvedClass;
      autoCreatedClass = classResolution.autoCreated;
    } catch (error) {
      rowErrors.push(error.message);
    }

    if (classRef && OBJECT_ID_PATTERN.test(classRef) && !resolvedClass) {
      rowErrors.push(`class ${classRef} was not found in this school`);
    }

    const parentRef = row.parentRef || '';
    const resolvedParent = parentRef
      ? (OBJECT_ID_PATTERN.test(parentRef)
        ? parentsById.get(parentRef)
        : parentsByNationalId.get(parentRef))
      : null;
    if (parentRef && !resolvedParent) rowErrors.push(`parent ${parentRef || '—'} was not found in this school`);

    if (fileNationalIds.has(row.nationalId)) rowErrors.push('nationalId is duplicated inside the import file');
    if (filePhones.has(row.phone)) rowErrors.push('phone is duplicated inside the import file');
    if (existingNationalIds.has(row.nationalId)) rowErrors.push('nationalId already exists');
    if (existingPhones.has(row.phone)) rowErrors.push('phone already exists');

    if (rowErrors.length) {
      errors.push(buildImportError(row.rowNumber, rowErrors.join('; '), row.raw));
      continue;
    }

    try {
      const result = await createStudent({
        nationalId: row.nationalId,
        name: importedName,
        phone: row.phone,
        classId: resolvedClass?._id,
        parentId: resolvedParent?._id,
        emergencyContacts: row.additionalPhone
          ? [{ phone: row.additionalPhone, relationship: row.additionalPhoneRelationship }]
          : [],
        gender: row.gender || 'unspecified',
        dateOfBirth: parsedDate,
        healthStatus: row.healthStatus || null,
        specialStatus: specialStatus.values,
      }, schoolId, requester);

      created.push({
        row: row.rowNumber,
        studentId: String(result.student._id),
        nationalId: row.nationalId,
      });

      if (autoCreatedClass) {
        autoCreatedClassCount += 1;
      }

      if (!resolvedClass || !hasClassInfo) {
        unassignedCount += 1;
      }

      fileNationalIds.add(row.nationalId);
      filePhones.add(row.phone);
      existingNationalIds.add(row.nationalId);
      existingPhones.add(row.phone);
    } catch (error) {
      errors.push(buildImportError(row.rowNumber, error.message, row.raw));
    }
  }

  const summary = {
    totalRows: normalizedRows.length,
    importedCount: created.length,
    errorCount: errors.length,
    autoCreatedClassCount,
    unassignedCount,
  };

  await notificationService.createNotification({
    schoolId,
    userId: requester.userId,
    type: 'import_complete',
    title: 'Student import completed',
    body: `${summary.importedCount} students imported, ${summary.errorCount} rows failed validation.`,
    data: {
      entityType: 'students',
      extra: summary,
    },
    deliveryMethod: ['in_app'],
  });

  auditLogger.log({
    schoolId,
    userId: requester.userId,
    action: 'import',
    entity: 'students',
    entityId: null,
    changes: summary,
  });

  return { summary, created, errors };
};

const updateStudent = async (studentId, schoolId, updates, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const student = await Student.findOne({ _id: studentId, schoolId, isDeleted: false });
  if (!student) throw new ApiError(404, 'Student not found');

  const { name, phone, classId, parentId, gender, dateOfBirth, healthStatus, specialStatus, isActive } = updates;
  const hasOwn = (field) => Object.prototype.hasOwnProperty.call(updates, field);

  if (name || phone) {
    await User.findByIdAndUpdate(student.userId, {
      $set: { ...(name && { name }), ...(phone && { phone }) },
    }, { runValidators: true });
  }

  const studentUpdates = {};
  if (hasOwn('classId')) {
    if (classId) {
      await ensureSchoolReference(Class, classId, schoolId, 'Class');
    }
    studentUpdates.classId = classId || null;
  }
  if (hasOwn('parentId')) {
    if (parentId) {
      await ensureSchoolReference(Parent, parentId, schoolId, 'Parent');
    }
    studentUpdates.parentId = parentId || null;
  }
  if (hasOwn('gender')) studentUpdates.gender = gender;
  if (hasOwn('dateOfBirth')) studentUpdates.dateOfBirth = dateOfBirth || null;
  if (hasOwn('healthStatus')) studentUpdates.healthStatus = healthStatus;
  if (specialStatus !== undefined) studentUpdates.specialStatus = specialStatus;
  if (isActive !== undefined) studentUpdates.isActive = isActive;

  const previousParentId = student.parentId ? String(student.parentId) : null;
  const nextParentId = hasOwn('parentId') ? (parentId ? String(parentId) : null) : previousParentId;

  Object.assign(student, studentUpdates);
  await student.save();

  if (previousParentId !== nextParentId) {
    await Promise.all([
      previousParentId ? Parent.findByIdAndUpdate(previousParentId, { $pull: { children: student._id } }) : Promise.resolve(),
      nextParentId ? Parent.findByIdAndUpdate(nextParentId, { $addToSet: { children: student._id } }) : Promise.resolve(),
    ]);
  }

  return student.populate('userId', 'name phone');
};

const deleteStudent = async (studentId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const student = await Student.findOne({ _id: studentId, schoolId, isDeleted: false });
  if (!student) throw new ApiError(404, 'Student not found');

  student.isDeleted = true;
  student.deletedAt = new Date();
  await student.save({ validateBeforeSave: false });

  await User.findByIdAndUpdate(student.userId, { isDeleted: true, deletedAt: new Date(), isActive: false });
  if (student.parentId) {
    await Parent.findByIdAndUpdate(student.parentId, { $pull: { children: student._id } });
  }
};

module.exports = {
  listStudents,
  getStudentById,
  getMyStudentProfile,
  createStudent,
  exportStudents,
  importStudents,
  updateStudent,
  deleteStudent,
  __testables: {
    buildStudentRosterWorkbookBuffer,
    normalizeLookupValue,
    normalizeGradeValue,
    normalizeSectionValue,
    findClassForImportRow,
    buildImportedClassPayload,
    findClassByImportPayload,
    resolveImportedClassGrade,
    normalizeImportRow,
  },
};
