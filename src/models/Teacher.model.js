const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    nationalId: { type: String, required: true, trim: true },
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    classes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
    specialization: { type: String, trim: true, default: null },
    joinDate: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

teacherSchema.index({ schoolId: 1 });
teacherSchema.index({ schoolId: 1, isDeleted: 1 });
teacherSchema.index({ schoolId: 1, nationalId: 1 }, { unique: true });

module.exports = mongoose.model('Teacher', teacherSchema);
