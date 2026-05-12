const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    nationalId: { type: String, required: true, trim: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', default: null },
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, enum: ['male', 'female', 'unspecified'], default: 'unspecified' },
    healthStatus: { type: String, trim: true, default: null },
    specialStatus: {
      type: [String],
      enum: ['orphan', 'health_condition', 'learning_difficulty'],
      default: [],
    },
    enrollmentDate: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

studentSchema.index({ schoolId: 1, isDeleted: 1, classId: 1, createdAt: -1 });
studentSchema.index({ schoolId: 1, isDeleted: 1, parentId: 1, createdAt: -1 });
studentSchema.index({ schoolId: 1, nationalId: 1 }, { unique: true });
studentSchema.index({ schoolId: 1, isDeleted: 1, isActive: 1 });

module.exports = mongoose.model('Student', studentSchema);
