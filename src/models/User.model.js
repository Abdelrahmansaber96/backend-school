const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config/env');

const nameSchema = new mongoose.Schema(
  {
    first: { type: String, required: true, trim: true, maxlength: 50 },
    last: { type: String, required: true, trim: true, maxlength: 50 },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
    role: {
      type: String,
      enum: ['super_admin', 'school_admin', 'teacher', 'parent', 'student', 'administrative'],
      required: true,
    },
    nationalId: { type: String, required: true, unique: true, trim: true, maxlength: 20 },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true, sparse: true, default: null },
    password: { type: String, required: true, select: false },
    name: { type: nameSchema, required: true },
    avatar: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    refreshToken: { type: String, select: false, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Indexes
userSchema.index({ schoolId: 1, role: 1 });
userSchema.index({ isDeleted: 1 });
userSchema.index({ email: 1 }, { unique: true, sparse: true });

// Virtual
userSchema.virtual('fullName').get(function () {
  return `${this.name.first} ${this.name.last}`;
});

// Instance methods
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isLocked = function () {
  return this.lockedUntil && this.lockedUntil > new Date();
};

// Pre-save: hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, config.BCRYPT_ROUNDS);
  next();
});

module.exports = mongoose.model('User', userSchema);
