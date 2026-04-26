const Joi = require('joi');
const objectId = Joi.string().hex().length(24);

const createSubjectSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    nameAr: Joi.string().max(100).optional(),
    code: Joi.string().min(2).max(20).uppercase().optional(),
  }),
};

const updateSubjectSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    nameAr: Joi.string().max(100).optional(),
    code: Joi.string().min(2).max(20).optional(),
    isActive: Joi.boolean().optional(),
  }),
};

module.exports = { createSubjectSchema, updateSubjectSchema };
