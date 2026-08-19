const crypto = require('crypto');
const RegistrationInvite = require('../models/RegistrationInvite.model');
const ApiError = require('../utils/ApiError');
const { getPagination, buildPagination } = require('../utils/pagination');

const DAY_MS = 24 * 60 * 60 * 1000;
const hashValue = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const normalizeCode = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const generateCode = () => crypto.randomBytes(6).toString('hex').toUpperCase();

const createInvite = async ({ label, expiresInDays = 7 }, requester) => {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + (expiresInDays * DAY_MS));
  const invite = await RegistrationInvite.create({
    codeHash: hashValue(code), label: label || null, expiresAt,
    cleanupAt: new Date(expiresAt.getTime() + (30 * DAY_MS)), createdBy: requester.userId,
  });
  return { invite, code };
};

const listInvites = async (query) => {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;
  const [data, total] = await Promise.all([
    RegistrationInvite.find(filter).populate('usedBySchoolId', 'name nameAr').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    RegistrationInvite.countDocuments(filter),
  ]);
  return { data, meta: buildPagination(total, page, limit, { query }) };
};

const revokeInvite = async (id) => {
  const invite = await RegistrationInvite.findOneAndUpdate(
    { _id: id, status: { $in: ['active', 'reserved'] } },
    { $set: { status: 'revoked', revokedAt: new Date(), reservationId: null, reservedAt: null } },
    { new: true },
  );
  if (!invite) throw new ApiError(404, 'كود الدعوة غير موجود أو مستخدم بالفعل');
  return invite;
};

const reserveInvite = async (plainCode) => {
  const code = normalizeCode(plainCode);
  if (!code) throw new ApiError(400, 'كود التسجيل مطلوب', 'INVALID_INVITE');
  const reservationId = crypto.randomUUID();
  const staleReservation = new Date(Date.now() - (10 * 60 * 1000));
  const invite = await RegistrationInvite.findOneAndUpdate(
    {
      codeHash: hashValue(code), expiresAt: { $gt: new Date() },
      $or: [{ status: 'active' }, { status: 'reserved', reservedAt: { $lt: staleReservation } }],
    },
    { $set: { status: 'reserved', reservedAt: new Date(), reservationId } },
    { new: true },
  ).select('+reservationId');
  if (!invite) throw new ApiError(400, 'كود التسجيل غير صالح أو منتهي أو مستخدم', 'INVALID_INVITE');
  return { invite, reservationId };
};

const finalizeInvite = async (inviteId, reservationId, schoolId) => {
  const result = await RegistrationInvite.findOneAndUpdate(
    { _id: inviteId, status: 'reserved', reservationId },
    { $set: { status: 'used', usedAt: new Date(), usedBySchoolId: schoolId }, $unset: { reservationId: 1, reservedAt: 1 } },
    { new: true },
  );
  if (!result) throw new ApiError(409, 'تعذر إكمال استخدام كود التسجيل', 'INVITE_CONFLICT');
  return result;
};

const releaseInvite = (inviteId, reservationId) => RegistrationInvite.updateOne(
  { _id: inviteId, status: 'reserved', reservationId },
  { $set: { status: 'active' }, $unset: { reservationId: 1, reservedAt: 1 } },
);

module.exports = {
  createInvite, listInvites, revokeInvite, reserveInvite, finalizeInvite, releaseInvite,
  __testables: { normalizeCode, hashValue },
};
