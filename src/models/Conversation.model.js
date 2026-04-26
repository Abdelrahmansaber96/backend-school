const mongoose = require('mongoose');

const lastMessageSchema = new mongoose.Schema(
  {
    text: { type: String, default: null },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sentAt: { type: Date, default: null },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    type: {
      type: String,
      enum: ['teacher_parent', 'admin_parent', 'admin_teacher'],
      required: true,
    },
    lastMessage: { type: lastMessageSchema, default: null },
    unreadCount: { type: Map, of: Number, default: {} },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

conversationSchema.index({ schoolId: 1, participants: 1 });
conversationSchema.index({ schoolId: 1, updatedAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
