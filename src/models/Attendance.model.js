const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    date: { type: Date, required: true },
    type: { type: String, enum: ['absence', 'late', 'permission'], required: true },
    notes: { type: String, trim: true, maxlength: 500, default: null },
    academicYear: { type: String, required: true },
    term: { type: String, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Ensure one record per student per day
attendanceSchema.index({ schoolId: 1, studentId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ schoolId: 1, isDeleted: 1, classId: 1, date: 1 });
attendanceSchema.index({ schoolId: 1, isDeleted: 1, date: 1 });
attendanceSchema.index({ schoolId: 1, isDeleted: 1, studentId: 1, academicYear: 1 });
attendanceSchema.index({ schoolId: 1, isDeleted: 1, studentId: 1, date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
