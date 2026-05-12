const mongoose = require('mongoose');
const { getCurrentHijriAcademicYear } = require('../utils/academicYear');

const termSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { _id: false },
);

const brandingSchema = new mongoose.Schema(
  {
    primaryColor: { type: String, default: '#C8A24D' },
    secondaryColor: { type: String, default: '#0a0e1a' },
    accentColor: { type: String, default: null },
    logoUrl: { type: String, default: null },
    faviconUrl: { type: String, default: null },
  },
  { _id: false },
);

const settingsSchema = new mongoose.Schema(
  {
    workingDays: {
      type: [String],
      enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      default: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
    },
    timezone: { type: String, default: 'Asia/Riyadh' },
    locale: { type: String, enum: ['ar', 'en'], default: 'ar' },
  },
  { _id: false },
);

const leaderContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: null, maxlength: 100 },
    phone: { type: String, trim: true, default: null, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, default: null },
  },
  { _id: false },
);

const administrativeContactSchema = new mongoose.Schema(
  {
    phone: { type: String, trim: true, default: null, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, default: null },
  },
  { _id: false },
);

const administrationSchema = new mongoose.Schema(
  {
    principal: { type: leaderContactSchema, default: () => ({}) },
    deputyPrincipal: { type: leaderContactSchema, default: () => ({}) },
    counselor: { type: leaderContactSchema, default: () => ({}) },
    administrativeContact: { type: administrativeContactSchema, default: () => ({}) },
  },
  { _id: false },
);

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    nameAr: { type: String, trim: true, default: null },
    subdomain: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, 'Invalid subdomain format'],
    },
    address: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: null },
    logo: { type: String, default: null },
    branding: { type: brandingSchema, default: () => ({}) },
    academicYear: { type: String, required: true, default: getCurrentHijriAcademicYear },
    terms: { type: [termSchema], default: [] },
    settings: { type: settingsSchema, default: () => ({}) },
    administration: { type: administrationSchema, default: () => ({}) },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

schoolSchema.index({ isActive: 1 });
schoolSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('School', schoolSchema);
