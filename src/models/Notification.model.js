const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['attendance', 'behavior', 'message', 'system', 'announcement', 'import_complete', 'report_ready'],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    data: {
      entityType: { type: String, default: null },
      entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
      extra: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    deliveryMethod: {
      type: [String],
      enum: ['in_app', 'email'],
      default: ['in_app'],
    },
    emailSent: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ schoolId: 1, userId: 1 });
// Auto-expire after 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model('Notification', notificationSchema);
