const Joi = require('joi');
const objectId = Joi.string().hex().length(24);

const createClassSchema = {
  body: Joi.object({
    name: Joi.string().min(1).max(20).required(),
    grade: Joi.string().min(1).max(50).required(),
    section: Joi.string().max(10).optional(),
    academicYear: Joi.string()
      .pattern(/^\d{4}-\d{4}$/)
      .required(),
    teacherId: objectId.optional(),
    capacity: Joi.number().integer().min(1).max(100).optional(),
  }),
};

const updateClassSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().min(1).max(20).optional(),
    grade: Joi.string().min(1).max(50).optional(),
    section: Joi.string().max(10).optional(),
    teacherId: objectId.allow(null).optional(),
    capacity: Joi.number().integer().min(1).max(100).optional(),
    isActive: Joi.boolean().optional(),
  }),
};

module.exports = { createClassSchema, updateClassSchema };
