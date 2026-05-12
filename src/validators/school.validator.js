const Joi = require('joi');
const { getCurrentHijriAcademicYear } = require('../utils/academicYear');

const termSchema = Joi.object({
  name: Joi.string().required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')).required(),
});

const adminSchema = Joi.object({
  name: Joi.object({
    first: Joi.string().min(2).max(50).required(),
    last: Joi.string().min(2).max(50).required(),
  }).required(),
  nationalId: Joi.string().min(5).max(20).required(),
  phone: Joi.string().min(7).max(20).required(),
  email: Joi.string().email().optional(),
});

const leaderContactSchema = Joi.object({
  name: Joi.string().min(2).max(100).allow('', null).optional(),
  phone: Joi.string().min(7).max(20).allow('', null).optional(),
  email: Joi.string().email().allow('', null).optional(),
});

const administrativeContactSchema = Joi.object({
  phone: Joi.string().min(7).max(20).allow('', null).optional(),
  email: Joi.string().email().allow('', null).optional(),
});

const administrationSchema = Joi.object({
  principal: leaderContactSchema.optional(),
  deputyPrincipal: leaderContactSchema.optional(),
  counselor: leaderContactSchema.optional(),
  administrativeContact: administrativeContactSchema.optional(),
});

const createSchoolSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    nameAr: Joi.string().max(100).optional(),
    subdomain: Joi.string()
      .min(3).max(63)
      .pattern(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
      .optional()
      .messages({
        'string.pattern.base': 'Subdomain must be lowercase alphanumeric with optional hyphens',
      }),
    address: Joi.string().min(5).max(200).required(),
    phone: Joi.string().min(7).max(20).required(),
    email: Joi.string().email().optional(),
    academicYear: Joi.string()
      .pattern(/^\d{4}-\d{4}$/)
      .default(() => getCurrentHijriAcademicYear()),
    administration: administrationSchema.optional(),
    admin: adminSchema.required(),
  }),
};

const updateSchoolSchema = {
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    nameAr: Joi.string().max(100).allow('', null).optional(),
    subdomain: Joi.string()
      .min(3).max(63)
      .pattern(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
      .optional()
      .messages({
        'string.pattern.base': 'Subdomain must be lowercase alphanumeric with optional hyphens',
      }),
    address: Joi.string().min(5).max(200).optional(),
    phone: Joi.string().min(7).max(20).optional(),
    email: Joi.string().email().allow('', null).optional(),
    academicYear: Joi.string()
      .pattern(/^\d{4}-\d{4}$/)
      .optional(),
    administration: administrationSchema.optional(),
  }),
};

const updateCurrentSchoolProfileSchema = {
  body: Joi.object({
    address: Joi.string().min(5).max(200).optional(),
    phone: Joi.string().min(7).max(20).optional(),
    email: Joi.string().email().allow('', null).optional(),
    academicYear: Joi.string()
      .pattern(/^\d{4}-\d{4}$/)
      .optional(),
    administration: administrationSchema.optional(),
  }),
};

const updateSettingsSchema = {
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    academicYear: Joi.string()
      .pattern(/^\d{4}-\d{4}$/)
      .optional(),
    terms: Joi.array().items(termSchema).optional(),
    settings: Joi.object({
      workingDays: Joi.array()
        .items(Joi.string().valid('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'))
        .optional(),
      timezone: Joi.string().optional(),
      locale: Joi.string().valid('ar', 'en').optional(),
    }).optional(),
  }),
};

const updateBrandingSchema = {
  body: Joi.object({
    primaryColor: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional()
      .messages({ 'string.pattern.base': 'primaryColor must be a valid hex color (#RRGGBB)' }),
    secondaryColor: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional()
      .messages({ 'string.pattern.base': 'secondaryColor must be a valid hex color (#RRGGBB)' }),
    accentColor: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow(null).optional(),
    logoUrl: Joi.string().uri().allow(null, '').optional(),
    faviconUrl: Joi.string().uri().allow(null, '').optional(),
    logo: Joi.string().uri().allow(null, '').optional(),
  }),
};

module.exports = {
  createSchoolSchema,
  updateSchoolSchema,
  updateCurrentSchoolProfileSchema,
  updateSettingsSchema,
  updateBrandingSchema,
};
