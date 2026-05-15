const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    type: { type: String, enum: ['image', 'document'], required: true },
    name: { type: String, required: true },
    size: { type: Number, default: null },
    publicId: { type: String, default: null },
  },
  { _id: false },
);

const behaviorSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    type: { type: String, enum: ['positive', 'negative'], required: true },
    category: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    description: { type: String, required: true, trim: true, minlength: 3, maxlength: 2000 },
    attachments: { type: [attachmentSchema], default: [] },
    notifyParent: { type: Boolean, default: true },
    academicYear: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

behaviorSchema.index({ schoolId: 1, isDeleted: 1, studentId: 1, createdAt: -1 });
behaviorSchema.index({ schoolId: 1, isDeleted: 1, classId: 1, createdAt: -1 });
behaviorSchema.index({ schoolId: 1, isDeleted: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('Behavior', behaviorSchema);
