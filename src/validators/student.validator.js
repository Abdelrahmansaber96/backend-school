const Joi = require('joi');
const objectId = Joi.string().hex().length(24);

const nameSchema = Joi.object({
  first: Joi.string().min(2).max(50).required(),
  last: Joi.string().min(2).max(50).required(),
});

const createStudentSchema = {
  body: Joi.object({
    nationalId: Joi.string().min(5).max(20).required(),
    name: nameSchema.required(),
    phone: Joi.string().min(7).max(20).required(),
    classId: objectId.required(),
    parentId: objectId.required(),
    gender: Joi.string().valid('male', 'female').required(),
    dateOfBirth: Joi.date().iso().optional(),
    healthStatus: Joi.string().max(500).optional(),
    specialStatus: Joi.array()
      .items(Joi.string().valid('orphan', 'health_condition', 'learning_difficulty'))
      .optional(),
  }),
};

const updateStudentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: nameSchema.optional(),
    phone: Joi.string().min(7).max(20).optional(),
    classId: objectId.optional(),
    parentId: objectId.optional(),
    gender: Joi.string().valid('male', 'female').optional(),
    dateOfBirth: Joi.date().iso().optional(),
    healthStatus: Joi.string().max(500).optional(),
    specialStatus: Joi.array()
      .items(Joi.string().valid('orphan', 'health_condition', 'learning_difficulty'))
      .optional(),
    isActive: Joi.boolean().optional(),
  }),
};

module.exports = { createStudentSchema, updateStudentSchema };
