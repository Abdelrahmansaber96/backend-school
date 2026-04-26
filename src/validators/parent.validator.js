const Joi = require('joi');
const objectId = Joi.string().hex().length(24);

const nameSchema = Joi.object({
  first: Joi.string().min(2).max(50).required(),
  last: Joi.string().min(2).max(50).required(),
});

const createParentSchema = {
  body: Joi.object({
    nationalId: Joi.string().min(5).max(20).required(),
    name: nameSchema.required(),
    phone: Joi.string().min(7).max(20).required(),
    email: Joi.string().email().optional(),
    occupation: Joi.string().max(100).optional(),
    address: Joi.string().max(200).optional(),
    children: Joi.array().items(objectId).optional(),
  }),
};

const updateParentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: nameSchema.optional(),
    phone: Joi.string().min(7).max(20).optional(),
    email: Joi.string().email().optional(),
    occupation: Joi.string().max(100).optional(),
    address: Joi.string().max(200).optional(),
    children: Joi.array().items(objectId).optional(),
  }),
};

module.exports = { createParentSchema, updateParentSchema };
