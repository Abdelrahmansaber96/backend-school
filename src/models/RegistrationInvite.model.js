const mongoose = require('mongoose');

const registrationInviteSchema = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true, select: false },
  label: { type: String, trim: true, maxlength: 120, default: null },
  status: { type: String, enum: ['active', 'reserved', 'used', 'revoked'], default: 'active' },
  expiresAt: { type: Date, required: true },
  cleanupAt: { type: Date, required: true },
  reservedAt: { type: Date, default: null },
  reservationId: { type: String, default: null, select: false },
  usedAt: { type: Date, default: null },
  usedBySchoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

registrationInviteSchema.index({ status: 1, expiresAt: 1 });
registrationInviteSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RegistrationInvite', registrationInviteSchema);
