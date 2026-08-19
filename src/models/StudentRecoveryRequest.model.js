const mongoose = require('mongoose');

const studentRecoveryRequestSchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  challengeHash: { type: String, required: true, select: false },
  status: { type: String, enum: ['identified', 'pending', 'code_sent', 'completed', 'cancelled'], default: 'identified' },
  expiresAt: { type: Date, required: true },
  cleanupAt: { type: Date, required: true },
  otpHash: { type: String, default: null, select: false },
  otpExpiresAt: { type: Date, default: null },
  attempts: { type: Number, default: 0 },
  requestedAt: { type: Date, default: null },
  codeIssuedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

studentRecoveryRequestSchema.index({ schoolId: 1, status: 1, createdAt: -1 });
studentRecoveryRequestSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('StudentRecoveryRequest', studentRecoveryRequestSchema);
