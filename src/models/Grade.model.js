const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    assessmentType: {
      type: String,
      enum: ['quiz', 'exam', 'assignment', 'project', 'midterm', 'final'],
      required: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator(value) {
          return this.maxScore == null || value <= this.maxScore;
        },
        message: 'Score cannot exceed maxScore',
      },
    },
    maxScore: { type: Number, required: true, min: 1 },
    examDate: { type: Date, required: true },
    term: { type: String, trim: true, default: null, maxlength: 50 },
    notes: { type: String, trim: true, default: null, maxlength: 500 },
    academicYear: { type: String, required: true, trim: true },
    isPublished: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

gradeSchema.index({ schoolId: 1, studentId: 1, subjectId: 1, examDate: -1 });
gradeSchema.index({ schoolId: 1, classId: 1, subjectId: 1, examDate: -1 });
gradeSchema.index({ schoolId: 1, teacherId: 1, examDate: -1 });
gradeSchema.index({ schoolId: 1, assessmentType: 1, examDate: -1 });

module.exports = mongoose.model('Grade', gradeSchema);