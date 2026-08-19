const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const StudentRecoveryRequest = require('../models/StudentRecoveryRequest.model');
const Student = require('../models/Student.model');
const User = require('../models/User.model');
const Class = require('../models/Class.model');
const School = require('../models/School.model');
const ApiError = require('../utils/ApiError');
const notificationService = require('./notification.service');
const { getPagination, buildPagination } = require('../utils/pagination');

const MINUTE_MS = 60 * 1000;
const hashValue = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const genericIdentityError = () => new ApiError(400, 'تعذر مطابقة البيانات المدخلة', 'RECOVERY_IDENTITY_INVALID');

const identifyStudent = async ({ nationalId, phone }) => {
  const user = await User.findOne({ nationalId, role: 'student', isActive: true, isDeleted: false }).select('_id schoolId phone');
  if (!user) throw genericIdentityError();
  const [student, school] = await Promise.all([
    Student.findOne({ userId: user._id, schoolId: user.schoolId, isActive: true, isDeleted: false })
      .select('_id classId parentId emergencyContacts')
      .populate({ path: 'parentId', select: 'userId', populate: { path: 'userId', select: 'phone' } }),
    School.findOne({ _id: user.schoolId, isDeleted: false, isActive: true, status: { $ne: 'suspended' } }).select('_id name nameAr'),
  ]);
  if (!student || !school) throw genericIdentityError();
  const normalizedPhone = String(phone).replace(/\D/g, '');
  const registeredPhones = [
    user.phone,
    student.parentId?.userId?.phone,
    ...(student.emergencyContacts || []).map((contact) => contact.phone),
  ].filter(Boolean).map((value) => String(value).replace(/\D/g, ''));
  if (!registeredPhones.includes(normalizedPhone)) throw genericIdentityError();
  const challengeToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + (15 * MINUTE_MS));
  const request = await StudentRecoveryRequest.create({
    schoolId: school._id, studentId: student._id, userId: user._id,
    challengeHash: hashValue(challengeToken), expiresAt,
    cleanupAt: new Date(Date.now() + (24 * 60 * MINUTE_MS)),
  });
  const classes = await Class.find({ schoolId: school._id, isActive: true, isDeleted: false })
    .select('name grade section').sort({ grade: 1, name: 1 }).lean();
  return {
    requestId: String(request._id), challengeToken,
    school: { name: school.nameAr || school.name },
    classes: classes.map((item) => ({ _id: String(item._id), name: item.name, grade: item.grade, section: item.section || null })),
    expiresAt,
  };
};

const submitRequest = async ({ requestId, challengeToken, grade, classId }) => {
  const request = await StudentRecoveryRequest.findOne({
    _id: requestId, status: 'identified', expiresAt: { $gt: new Date() },
  }).select('+challengeHash');
  if (!request || request.challengeHash !== hashValue(challengeToken)) throw genericIdentityError();
  const student = await Student.findOne({ _id: request.studentId, schoolId: request.schoolId, classId, isDeleted: false }).populate('classId', 'grade');
  if (!student || String(student.classId?.grade) !== String(grade)) throw genericIdentityError();
  request.status = 'pending';
  request.requestedAt = new Date();
  request.expiresAt = new Date(Date.now() + (24 * 60 * MINUTE_MS));
  await request.save();
  const admins = await User.find({ schoolId: request.schoolId, role: 'school_admin', isActive: true, isDeleted: false }).select('_id');
  await Promise.allSettled(admins.map((admin) => notificationService.createNotification({
    schoolId: request.schoolId, userId: admin._id, type: 'security',
    title: 'طلب استعادة كلمة مرور طالب', body: 'يوجد طلب جديد يحتاج التحقق وإرسال رمز مؤقت إلى ولي الأمر.',
    data: { entityType: 'student_recovery', entityId: request._id }, deliveryMethod: ['in_app'],
  })));
};

const listRequests = async (schoolId, query) => {
  const { page, limit, skip } = getPagination(query);
  const filter = { schoolId };
  if (query.status) filter.status = query.status;
  const [rows, total] = await Promise.all([
    StudentRecoveryRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate({ path: 'studentId', select: 'userId classId parentId emergencyContacts', populate: [
        { path: 'userId', select: 'name phone nationalId' },
        { path: 'classId', select: 'name grade section' },
        { path: 'parentId', select: 'userId', populate: { path: 'userId', select: 'name phone' } },
      ] }).lean(),
    StudentRecoveryRequest.countDocuments(filter),
  ]);
  const data = rows.map((row) => ({
    _id: row._id, status: row.status, createdAt: row.createdAt, requestedAt: row.requestedAt,
    codeIssuedAt: row.codeIssuedAt, completedAt: row.completedAt, otpExpiresAt: row.otpExpiresAt,
    student: row.studentId ? {
      _id: row.studentId._id,
      name: `${row.studentId.userId?.name?.first || ''} ${row.studentId.userId?.name?.last || ''}`.trim(),
      nationalId: row.studentId.userId?.nationalId,
      class: row.studentId.classId,
      guardianPhone: row.studentId.parentId?.userId?.phone || row.studentId.emergencyContacts?.[0]?.phone || row.studentId.userId?.phone || null,
    } : null,
  }));
  return { data, meta: buildPagination(total, page, limit, { query }) };
};

const issueCode = async (requestId, schoolId, handlerId) => {
  const request = await StudentRecoveryRequest.findOne({
    _id: requestId, schoolId, status: { $in: ['pending', 'code_sent'] }, expiresAt: { $gt: new Date() },
  });
  if (!request) throw new ApiError(404, 'طلب الاستعادة غير موجود أو منتهي');
  const otp = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  request.otpHash = await bcrypt.hash(otp, 10);
  request.otpExpiresAt = new Date(Date.now() + (10 * MINUTE_MS));
  request.attempts = 0;
  request.status = 'code_sent';
  request.codeIssuedAt = new Date();
  request.handledBy = handlerId;
  await request.save();
  const student = await Student.findById(request.studentId)
    .populate('userId', 'name phone').populate({ path: 'parentId', select: 'userId', populate: { path: 'userId', select: 'phone' } }).lean();
  return {
    otp,
    studentName: `${student?.userId?.name?.first || ''} ${student?.userId?.name?.last || ''}`.trim(),
    phone: student?.parentId?.userId?.phone || student?.emergencyContacts?.[0]?.phone || student?.userId?.phone || null,
    expiresAt: request.otpExpiresAt,
  };
};

const completeRecovery = async ({ requestId, otp, newPassword }) => {
  const request = await StudentRecoveryRequest.findOne({
    _id: requestId, status: 'code_sent', otpExpiresAt: { $gt: new Date() }, attempts: { $lt: 5 },
  }).select('+otpHash');
  if (!request || !request.otpHash) throw new ApiError(400, 'الرمز غير صالح أو منتهي', 'RECOVERY_CODE_INVALID');
  const valid = await bcrypt.compare(otp, request.otpHash);
  if (!valid) {
    request.attempts += 1;
    await request.save({ validateBeforeSave: false });
    throw new ApiError(400, 'الرمز غير صالح أو منتهي', 'RECOVERY_CODE_INVALID');
  }
  const user = await User.findById(request.userId);
  if (!user || user.isDeleted) throw new ApiError(400, 'تعذر تحديث الحساب');
  user.password = newPassword;
  user.mustChangePassword = false;
  user.refreshToken = null;
  await user.save();
  request.status = 'completed';
  request.completedAt = new Date();
  request.otpHash = null;
  await request.save({ validateBeforeSave: false });
  const admins = await User.find({ schoolId: request.schoolId, role: 'school_admin', isActive: true, isDeleted: false }).select('_id');
  await Promise.allSettled(admins.map((admin) => notificationService.createNotification({
    schoolId: request.schoolId, userId: admin._id, type: 'security',
    title: 'اكتملت استعادة حساب طالب', body: 'تم تغيير كلمة مرور الطالب بنجاح. يمكن إرسال تأكيد لولي الأمر دون تضمين كلمة المرور.',
    data: { entityType: 'student_recovery', entityId: request._id }, deliveryMethod: ['in_app'],
  })));
};

module.exports = {
  identifyStudent, submitRequest, listRequests, issueCode, completeRecovery,
  __testables: { hashValue },
};
