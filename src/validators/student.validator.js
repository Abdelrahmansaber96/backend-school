const Joi = require('joi');
const objectId = Joi.string().hex().length(24);

const nameSchema = Joi.object({
  first: Joi.string().min(2).max(50).required(),
  last: Joi.string().min(2).max(50).required(),
});

const emergencyContactSchema = Joi.object({
  phone: Joi.string().min(7).max(20).required(),
  relationship: Joi.string().min(2).max(50).required(),
});
const temporaryPasswordSchema = Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/);
const newParentSchema = Joi.object({
  nationalId: Joi.string().min(5).max(20).required(),
  name: nameSchema.required(),
  phone: Joi.string().min(7).max(20).required(),
  email: Joi.string().email().allow('', null).optional(),
});

const createStudentSchema = {
  body: Joi.object({
    nationalId: Joi.string().min(5).max(20).required(),
    name: nameSchema.required(),
    phone: Joi.string().min(7).max(20).required(),
    classId: objectId.required(),
    parentId: objectId.optional(),
    newParent: newParentSchema.optional(),
    temporaryPassword: temporaryPasswordSchema.optional(),
    emergencyContacts: Joi.array().items(emergencyContactSchema).max(5).optional(),
    gender: Joi.string().valid('male', 'female', 'unspecified').optional(),
    dateOfBirth: Joi.date().iso().optional(),
    healthStatus: Joi.string().max(500).optional(),
    specialStatus: Joi.array()
      .items(Joi.string().valid('orphan', 'health_condition', 'learning_difficulty'))
      .optional(),
  }).oxor('parentId', 'newParent'),
};

const updateStudentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: nameSchema.optional(),
    phone: Joi.string().min(7).max(20).optional(),
    classId: objectId.allow(null).optional(),
    parentId: objectId.allow(null).optional(),
    emergencyContacts: Joi.array().items(emergencyContactSchema).max(5).optional(),
    gender: Joi.string().valid('male', 'female', 'unspecified').optional(),
    dateOfBirth: Joi.date().iso().allow(null).optional(),
    healthStatus: Joi.string().max(500).allow('', null).optional(),
    specialStatus: Joi.array()
      .items(Joi.string().valid('orphan', 'health_condition', 'learning_difficulty'))
      .optional(),
    isActive: Joi.boolean().optional(),
  }),
};

module.exports = { createStudentSchema, updateStudentSchema };
