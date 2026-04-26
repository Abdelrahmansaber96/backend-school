const mongoose = require('mongoose');

const parentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    nationalId: { type: String, required: true, trim: true },
    occupation: { type: String, trim: true, default: null },
    address: { type: String, trim: true, default: null },
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

parentSchema.index({ schoolId: 1 });
parentSchema.index({ schoolId: 1, nationalId: 1 }, { unique: true });
parentSchema.index({ children: 1 });

module.exports = mongoose.model('Parent', parentSchema);
