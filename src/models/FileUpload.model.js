const mongoose = require('mongoose');

const fileUploadSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fileName: { type: String, required: true },
    fileType: { type: String, enum: ['image', 'document', 'spreadsheet'], required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    context: {
      type: String,
      enum: ['avatar', 'behavior', 'message', 'import'],
      required: true,
    },
    contextId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isOrphaned: { type: Boolean, default: true }, // set to false when linked to a parent entity
  },
  { timestamps: true },
);

fileUploadSchema.index({ schoolId: 1, context: 1 });
fileUploadSchema.index({ uploadedBy: 1 });
fileUploadSchema.index({ publicId: 1 }, { unique: true });

module.exports = mongoose.model('FileUpload', fileUploadSchema);
