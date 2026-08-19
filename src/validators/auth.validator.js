const Joi = require('joi');

const loginSchema = {
  body: Joi.object({
    identifier: Joi.string().trim().required().messages({ 'any.required': 'identifier is required' }),
    password: Joi.string().required(),
    identifierType: Joi.string().valid('nationalId', 'phone').default('nationalId'),
  }),
};

const changePasswordSchema = {
  body: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters',
        'string.pattern.base': 'Password must contain uppercase, lowercase, and a number',
      }),
  }),
};

const resetPasswordSchema = {
  params: Joi.object({
    userId: Joi.string().hex().length(24).required(),
  }),
  body: Joi.object({
    temporaryPassword: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).optional(),
  }),
};

const registerSchoolSchema = {
  body: Joi.object({
    inviteCode: Joi.string().trim().min(8).max(32).required(),
    schoolName: Joi.string().min(2).max(100).required(),
    schoolNameAr: Joi.string().max(100).optional(),
    subdomain: Joi.string()
      .min(3).max(63)
      .pattern(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
      .optional()
      .messages({
        'string.pattern.base': 'Subdomain must be lowercase alphanumeric with optional hyphens',
      }),
    address: Joi.string().min(5).max(200).required(),
    phone: Joi.string().min(7).max(20).required(),
    email: Joi.string().email().required(),
    admin: Joi.object({
      name: Joi.object({
        first: Joi.string().min(2).max(50).required(),
        last: Joi.string().min(2).max(50).required(),
      }).required(),
      nationalId: Joi.string().min(5).max(20).required(),
      phone: Joi.string().min(7).max(20).required(),
      email: Joi.string().email().required(),
      password: Joi.string()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .required()
        .messages({
          'string.min': 'Password must be at least 8 characters',
          'string.pattern.base': 'Password must contain uppercase, lowercase, and a number',
        }),
    }).required(),
  }),
};

const requestEmailResetSchema = { body: Joi.object({
  identifier: Joi.string().trim().required(),
  email: Joi.string().email().required(),
}) };
const completeEmailResetSchema = { body: Joi.object({
  token: Joi.string().hex().length(64).required(),
  newPassword: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required(),
}) };
const verifyEmailSchema = { body: Joi.object({ token: Joi.string().hex().length(64).required() }) };

module.exports = {
  loginSchema, changePasswordSchema, resetPasswordSchema, registerSchoolSchema,
  requestEmailResetSchema, completeEmailResetSchema, verifyEmailSchema,
};
