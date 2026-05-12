const Joi = require('joi');

const createAdministrativeUserSchema = {
  body: Joi.object({
    name: Joi.object({
      first: Joi.string().trim().min(2).max(50).required(),
      last: Joi.string().trim().min(2).max(50).required(),
    }).required(),
    nationalId: Joi.string().trim().min(5).max(20).required(),
    phone: Joi.string().trim().min(7).max(20).required(),
    email: Joi.string().trim().email().allow('', null).optional(),
  }),
};

module.exports = { createAdministrativeUserSchema };