const XLSX = require('xlsx');
const Teacher = require('../models/Teacher.model');
const Subject = require('../models/Subject.model');
const Class = require('../models/Class.model');
const User = require('../models/User.model');
const ApiError = require('../utils/ApiError');
const { getPagination, getSorting, buildPagination } = require('../utils/pagination');
const { getTeacherScope, ensureSchoolReferences } = require('../utils/accessScope');
const { assertRequesterRole } = require('../utils/authorization');

const normalizeImportHeader = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s._-]+/g, '');

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

const normalizeImportRow = ({ rowNumber, row }) => {
  const normalized = { rowNumber, raw: row };

  Object.entries(row).forEach(([key, value]) => {
    const header = normalizeImportHeader(key);

    if (['nationalid', 'teachernationalid', 'nationalnumber', 'رقمالهوية', 'الهوية'].includes(header)) normalized.nationalId = String(value || '').trim();
    if (['firstname', 'teacherfirstname', 'الاسمالاول'].includes(header)) normalized.firstName = String(value || '').trim();
    if (['lastname', 'teacherlastname', 'اسمالعائلة', 'الاسمالاخير'].includes(header)) normalized.lastName = String(value || '').trim();
    if (['fullname', 'name', 'teachername', 'الاسم', 'اسمالمعلم', 'اسمكامل'].includes(header)) normalized.fullName = String(value || '').trim();
    if (['phone', 'teacherphone', 'mobilenumber', 'الجوال', 'رقمالجوال', 'هاتف'].includes(header)) normalized.phone = String(value || '').trim();
    if (['email', 'teacheremail', 'البريدالالكتروني'].includes(header)) normalized.email = String(value || '').trim().toLowerCase();
    if (['specialization', 'speciality', 'التخصص'].includes(header)) normalized.specialization = String(value || '').trim();
  });

  return normalized;
};

const resolveImportedTeacherName = (row) => {
  const first = String(row.firstName || '').trim();
  const last = String(row.lastName || '').trim();

  if (first || last) {
    return { first, last };
  }

  return splitImportedName(row.fullName);
};

const buildImportError = (rowNumber, message, row) => ({ row: rowNumber, message, data: row });

/**
 * List teachers for a school
 */
const listTeachers = async (query, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin']);

  const { page, limit, skip } = getPagination(query);
  const sort = getSorting(query, ['createdAt', 'joinDate']);

  const filter = { isDeleted: false };
  if (schoolId) filter.schoolId = schoolId;
  if (query.search) {
    // Search on the joined User documents – we'll populate first or use lookup
    // For simplicity, search by nationalId on Teacher directly
    filter.nationalId = { $regex: query.search, $options: 'i' };
  }

  const [teachers, total] = await Promise.all([
    Teacher.find(filter)
      .populate('userId', 'name phone email avatar isActive lastLogin')
      .populate('subjects', 'name code')
      .populate('classes', 'name grade section')
      .skip(skip).limit(limit).sort(sort),
    Teacher.countDocuments(filter),
  ]);

  return {
    data: teachers,
    meta: buildPagination(total, page, limit, {
      query,
      allowedSortFields: ['createdAt', 'joinDate'],
    }),
  };
};

/**
 * Get a single teacher
 */
const getTeacherById = async (teacherId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher']);

  const filter = { _id: teacherId, schoolId, isDeleted: false };

  if (requester.role === 'teacher') {
    const scope = await getTeacherScope(requester.userId, schoolId);
    filter._id = scope.teacherId;
  }

  const teacher = await Teacher.findOne(filter)
    .populate('userId', 'name phone email avatar isActive mustChangePassword')
    .populate('subjects', 'name code')
    .populate('classes', 'name grade section academicYear');
  if (!teacher) throw new ApiError(404, 'Teacher not found');
  return teacher;
};

/**
 * Create a teacher (also creates their User account)
 */
const createTeacher = async (data, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const { nationalId, name, phone, email, specialization, subjects, classes, joinDate } = data;

  const existingUser = await User.findOne({
    $or: [{ nationalId }, { phone }, ...(email ? [{ email }] : [])], isDeleted: false,
  });
  if (existingUser) throw new ApiError(409, 'National ID or phone already in use');

  await Promise.all([
    ensureSchoolReferences(Subject, subjects, schoolId, 'subjects'),
    ensureSchoolReferences(Class, classes, schoolId, 'classes'),
  ]);

  const tempPassword = `Teacher@${nationalId.slice(-4)}`;

  const user = await User.create({
    schoolId, role: 'teacher', nationalId, phone, email,
    password: tempPassword,
    name, mustChangePassword: true,
  });

  const teacher = await Teacher.create({
    userId: user._id, schoolId, nationalId, specialization, subjects, classes, joinDate,
  });

  return { teacher, tempPassword };
};

const importTeachers = async (file, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  if (!file) {
    throw new ApiError(400, 'Import file is required');
  }

  const rows = extractImportRows(file);
  if (!rows.length) {
    throw new ApiError(400, 'Import file does not contain any rows');
  }

  const normalizedRows = rows.map(normalizeImportRow);
  const requestedNationalIds = normalizedRows.map((row) => row.nationalId).filter(Boolean);
  const requestedPhones = normalizedRows.map((row) => row.phone).filter(Boolean);
  const requestedEmails = normalizedRows.map((row) => row.email).filter(Boolean);
  const existingFilters = [
    requestedNationalIds.length ? { nationalId: { $in: requestedNationalIds } } : null,
    requestedPhones.length ? { phone: { $in: requestedPhones } } : null,
    requestedEmails.length ? { email: { $in: requestedEmails } } : null,
  ].filter(Boolean);
  const existingUsers = existingFilters.length
    ? await User.find({ isDeleted: false, $or: existingFilters }).select('nationalId phone email').lean()
    : [];

  const existingNationalIds = new Set(existingUsers.map((user) => String(user.nationalId)));
  const existingPhones = new Set(existingUsers.map((user) => String(user.phone)));
  const existingEmails = new Set(existingUsers.map((user) => String(user.email || '').trim().toLowerCase()).filter(Boolean));
  const fileNationalIds = new Set();
  const filePhones = new Set();
  const fileEmails = new Set();
  const created = [];
  const errors = [];

  for (const row of normalizedRows) {
    const rowErrors = [];
    const importedName = resolveImportedTeacherName(row);
    const normalizedEmail = String(row.email || '').trim().toLowerCase();

    if (!row.nationalId) rowErrors.push('nationalId is required');
    if (!importedName.first) rowErrors.push('teacher name is required');
    if (!importedName.last) rowErrors.push('teacher name is incomplete');
    if (!row.phone) rowErrors.push('phone is required');
    if (fileNationalIds.has(row.nationalId)) rowErrors.push('nationalId is duplicated inside the import file');
    if (filePhones.has(row.phone)) rowErrors.push('phone is duplicated inside the import file');
    if (normalizedEmail && fileEmails.has(normalizedEmail)) rowErrors.push('email is duplicated inside the import file');
    if (existingNationalIds.has(row.nationalId)) rowErrors.push('nationalId already exists');
    if (existingPhones.has(row.phone)) rowErrors.push('phone already exists');
    if (normalizedEmail && existingEmails.has(normalizedEmail)) rowErrors.push('email already exists');

    if (rowErrors.length) {
      errors.push(buildImportError(row.rowNumber, rowErrors.join('; '), row.raw));
      continue;
    }

    try {
      const result = await createTeacher({
        nationalId: row.nationalId,
        name: importedName,
        phone: row.phone,
        email: normalizedEmail || undefined,
        specialization: row.specialization || undefined,
      }, schoolId, requester);

      created.push({
        row: row.rowNumber,
        teacherId: String(result.teacher._id),
        name: `${importedName.first} ${importedName.last}`,
        nationalId: row.nationalId,
        temporaryPassword: result.tempPassword,
      });

      fileNationalIds.add(row.nationalId);
      filePhones.add(row.phone);
      existingNationalIds.add(row.nationalId);
      existingPhones.add(row.phone);

      if (normalizedEmail) {
        fileEmails.add(normalizedEmail);
        existingEmails.add(normalizedEmail);
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

/**
 * Update teacher profile
 */
const updateTeacher = async (teacherId, schoolId, updates, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const teacher = await Teacher.findOne({ _id: teacherId, schoolId, isDeleted: false });
  if (!teacher) throw new ApiError(404, 'Teacher not found');

  const { name, phone, email, specialization, subjects, classes, joinDate } = updates;

  // Update User fields if provided
  if (name || phone || email) {
    await User.findByIdAndUpdate(teacher.userId, {
      $set: { ...(name && { name }), ...(phone && { phone }), ...(email && { email }) },
    }, { runValidators: true });
  }

  // Update Teacher fields
  const teacherUpdates = {};
  if (specialization !== undefined) teacherUpdates.specialization = specialization;
  if (subjects !== undefined) {
    await ensureSchoolReferences(Subject, subjects, schoolId, 'subjects');
    teacherUpdates.subjects = subjects;
  }
  if (classes !== undefined) {
    await ensureSchoolReferences(Class, classes, schoolId, 'classes');
    teacherUpdates.classes = classes;
  }
  if (joinDate !== undefined) teacherUpdates.joinDate = joinDate;

  if (Object.keys(teacherUpdates).length > 0) {
    Object.assign(teacher, teacherUpdates);
    await teacher.save();
  }

  return teacher.populate('userId', 'name phone email');
};

/**
 * Soft-delete a teacher
 */
const deleteTeacher = async (teacherId, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['school_admin']);

  const teacher = await Teacher.findOne({ _id: teacherId, schoolId, isDeleted: false });
  if (!teacher) throw new ApiError(404, 'Teacher not found');

  teacher.isDeleted = true;
  teacher.deletedAt = new Date();
  await teacher.save({ validateBeforeSave: false });

  await User.findByIdAndUpdate(teacher.userId, {
    isDeleted: true, deletedAt: new Date(), isActive: false,
  });
};

module.exports = {
  listTeachers,
  getTeacherById,
  createTeacher,
  importTeachers,
  updateTeacher,
  deleteTeacher,
};
