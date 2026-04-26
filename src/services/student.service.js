const XLSX = require('xlsx');
const Student = require('../models/Student.model');
const User = require('../models/User.model');
const Class = require('../models/Class.model');
const Parent = require('../models/Parent.model');
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

const IMPORT_SPECIAL_STATUS = new Set(['orphan', 'health_condition', 'learning_difficulty']);
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const normalizeImportHeader = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s._-]+/g, '');

const normalizeLookupValue = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

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

    if (['nationalid', 'studentnationalid'].includes(header)) normalized.nationalId = String(value || '').trim();
    if (['firstname', 'studentfirstname', 'namefirst'].includes(header)) normalized.firstName = String(value || '').trim();
    if (['lastname', 'studentlastname', 'namelast'].includes(header)) normalized.lastName = String(value || '').trim();
    if (['phone', 'studentphone', 'mobilenumber'].includes(header)) normalized.phone = String(value || '').trim();
    if (['classid', 'classname', 'class', 'classcode'].includes(header)) normalized.classRef = String(value || '').trim();
    if (['parentid', 'parentnationalid', 'parentnationalnumber', 'parent'].includes(header)) normalized.parentRef = String(value || '').trim();
    if (['gender', 'sex'].includes(header)) normalized.gender = String(value || '').trim().toLowerCase();
    if (['dateofbirth', 'dob', 'birthdate'].includes(header)) normalized.dateOfBirth = value;
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

const listStudents = async (query, schoolId, requester = {}) => {
  assertRequesterRole(requester, ['super_admin', 'school_admin', 'teacher']);

  const { page, limit, skip } = getPagination(query);
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
  });
  const parentLookupStages = [
    ...buildLookupStages('parents', 'parentId', 'parent', { _id: 1, userId: 1 }),
    ...buildLookupStages('users', 'parent.userId', 'parentUser', { _id: 1, name: 1, phone: 1 }),
  ];

  const needsUserLookupForFilter = Boolean(searchPattern);
  const needsClassLookupForFilter = Boolean(query.grade);

  const pipeline = [
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
    {
      $facet: {
        data: [
          { $sort: sort },
          { $skip: skip },
          { $limit: limit },
          ...(!needsUserLookupForFilter ? userLookupStages : []),
          ...(!needsClassLookupForFilter ? classLookupStages : []),
          ...parentLookupStages,
          {
            $project: {
              _id: 1,
              schoolId: 1,
              nationalId: 1,
              dateOfBirth: 1,
              gender: 1,
              healthStatus: 1,
              specialStatus: 1,
              enrollmentDate: 1,
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
                  },
                  null,
                ],
              },
              parentId: {
                $cond: [
                  { $ifNull: ['$parent._id', false] },
                  {
                    _id: '$parent._id',
                    userId: {
                      _id: '$parentUser._id',
                      name: '$parentUser.name',
                      phone: '$parentUser.phone',
                    },
                  },
                  null,
                ],
              },
            },
          },
        ],
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

  const { nationalId, name, phone, classId, parentId, gender, dateOfBirth, healthStatus, specialStatus } = data;

  const existing = await User.findOne({ $or: [{ nationalId }, { phone }], isDeleted: false });
  if (existing) throw new ApiError(409, 'National ID or phone already in use');

  const [parent, cls] = await Promise.all([
    ensureSchoolReference(Parent, parentId, schoolId, 'Parent'),
    ensureSchoolReference(Class, classId, schoolId, 'Class'),
  ]);

  const tempPassword = `Student@${nationalId.slice(-4)}`;

  const user = await User.create({
    schoolId, role: 'student', nationalId, phone,
    password: tempPassword,
    name, mustChangePassword: false, // students usually don't change passwords
  });

  const student = await Student.create({
    userId: user._id, schoolId, nationalId, classId, parentId, gender,
    dateOfBirth, healthStatus, specialStatus,
  });

  // Add student to parent's children list
  await Parent.findByIdAndUpdate(parent._id, { $addToSet: { children: student._id } });

  return { student, tempPassword };
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
    Class.find({ schoolId, isDeleted: false }).select('_id name').lean(),
    Parent.find({ schoolId, isDeleted: false }).select('_id nationalId').lean(),
  ]);

  const classesById = new Map(classes.map((item) => [String(item._id), item]));
  const classesByName = new Map(classes.map((item) => [normalizeLookupValue(item.name), item]));
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

  for (const row of normalizedRows) {
    const rowErrors = [];

    if (!row.nationalId) rowErrors.push('nationalId is required');
    if (!row.firstName) rowErrors.push('firstName is required');
    if (!row.lastName) rowErrors.push('lastName is required');
    if (!row.phone) rowErrors.push('phone is required');
    if (!row.classRef) rowErrors.push('classId or class name is required');
    if (!row.parentRef) rowErrors.push('parentId or parentNationalId is required');
    if (!['male', 'female'].includes(row.gender)) rowErrors.push('gender must be male or female');

    const parsedDate = parseDateValue(row.dateOfBirth);
    if (row.dateOfBirth && !parsedDate) rowErrors.push('dateOfBirth is invalid');

    const specialStatus = parseSpecialStatus(row.specialStatus);
    if (specialStatus.invalid.length) {
      rowErrors.push(`specialStatus contains invalid values: ${specialStatus.invalid.join(', ')}`);
    }

    const classRef = row.classRef || '';
    const resolvedClass = OBJECT_ID_PATTERN.test(classRef)
      ? classesById.get(classRef)
      : classesByName.get(normalizeLookupValue(classRef));
    if (!resolvedClass) rowErrors.push(`class ${classRef || '—'} was not found in this school`);

    const parentRef = row.parentRef || '';
    const resolvedParent = OBJECT_ID_PATTERN.test(parentRef)
      ? parentsById.get(parentRef)
      : parentsByNationalId.get(parentRef);
    if (!resolvedParent) rowErrors.push(`parent ${parentRef || '—'} was not found in this school`);

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
        name: { first: row.firstName, last: row.lastName },
        phone: row.phone,
        classId: resolvedClass._id,
        parentId: resolvedParent._id,
        gender: row.gender,
        dateOfBirth: parsedDate,
        healthStatus: row.healthStatus || null,
        specialStatus: specialStatus.values,
      }, schoolId, requester);

      created.push({
        row: row.rowNumber,
        studentId: String(result.student._id),
        nationalId: row.nationalId,
        temporaryPassword: result.tempPassword,
      });

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

  if (name || phone) {
    await User.findByIdAndUpdate(student.userId, {
      $set: { ...(name && { name }), ...(phone && { phone }) },
    }, { runValidators: true });
  }

  const studentUpdates = {};
  if (classId) {
    await ensureSchoolReference(Class, classId, schoolId, 'Class');
    studentUpdates.classId = classId;
  }
  if (parentId) {
    await ensureSchoolReference(Parent, parentId, schoolId, 'Parent');
    studentUpdates.parentId = parentId;
  }
  if (gender) studentUpdates.gender = gender;
  if (dateOfBirth) studentUpdates.dateOfBirth = dateOfBirth;
  if (healthStatus !== undefined) studentUpdates.healthStatus = healthStatus;
  if (specialStatus !== undefined) studentUpdates.specialStatus = specialStatus;
  if (isActive !== undefined) studentUpdates.isActive = isActive;

  const previousParentId = String(student.parentId);

  Object.assign(student, studentUpdates);
  await student.save();

  if (parentId && previousParentId !== String(parentId)) {
    await Promise.all([
      Parent.findByIdAndUpdate(previousParentId, { $pull: { children: student._id } }),
      Parent.findByIdAndUpdate(parentId, { $addToSet: { children: student._id } }),
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
  await Parent.findByIdAndUpdate(student.parentId, { $pull: { children: student._id } });
};

module.exports = {
  listStudents,
  getStudentById,
  getMyStudentProfile,
  createStudent,
  importStudents,
  updateStudent,
  deleteStudent,
};
