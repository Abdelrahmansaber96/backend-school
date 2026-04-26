const Joi = require('joi');
const objectId = Joi.string().hex().length(24);

const nameSchema = Joi.object({
  first: Joi.string().min(2).max(50).required(),
  last: Joi.string().min(2).max(50).required(),
});

const createTeacherSchema = {
  body: Joi.object({
    nationalId: Joi.string().min(5).max(20).required(),
    name: nameSchema.required(),
    phone: Joi.string().min(7).max(20).required(),
    email: Joi.string().email().optional(),
    specialization: Joi.string().max(100).optional(),
    subjects: Joi.array().items(objectId).optional(),
    classes: Joi.array().items(objectId).optional(),
    joinDate: Joi.date().iso().optional(),
  }),
};

const updateTeacherSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: nameSchema.optional(),
    phone: Joi.string().min(7).max(20).optional(),
    email: Joi.string().email().optional(),
    specialization: Joi.string().max(100).optional(),
    subjects: Joi.array().items(objectId).optional(),
    classes: Joi.array().items(objectId).optional(),
    joinDate: Joi.date().iso().optional(),
  }),
};

module.exports = { createTeacherSchema, updateTeacherSchema };
