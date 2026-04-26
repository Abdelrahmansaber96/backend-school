const mongoose = require('mongoose');

const classSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true, maxlength: 20 },
    grade: { type: String, required: true, trim: true },
    section: { type: String, trim: true, default: null },
    academicYear: { type: String, required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
    capacity: { type: Number, default: null, min: 1, max: 100 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

classSchema.index({ schoolId: 1, academicYear: 1 });
classSchema.index({ schoolId: 1, name: 1, academicYear: 1 }, { unique: true });
classSchema.index({ teacherId: 1 });

module.exports = mongoose.model('Class', classSchema);
