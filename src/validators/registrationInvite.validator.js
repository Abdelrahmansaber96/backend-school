const Joi = require('joi');

const createInviteSchema = { body: Joi.object({
  label: Joi.string().trim().max(120).allow('', null).optional(),
  expiresInDays: Joi.number().integer().min(1).max(90).default(7),
}) };
const revokeInviteSchema = { params: Joi.object({ id: Joi.string().hex().length(24).required() }) };

module.exports = { createInviteSchema, revokeInviteSchema };
