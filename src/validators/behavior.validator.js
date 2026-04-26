const Joi = require('joi');
const objectId = Joi.string().hex().length(24);
const attachmentSchema = Joi.object({
  url: Joi.string().uri().required(),
  type: Joi.string().valid('image', 'document').required(),
  name: Joi.string().required(),
  size: Joi.number().optional(),
  publicId: Joi.string().optional(),
});
const categorySchema = Joi.string().trim().max(100).allow('').optional();
const descriptionSchema = Joi.string().trim().min(3).max(2000);

const createBehaviorSchema = {
  body: Joi.object({
    studentId: objectId.required(),
    classId: objectId.required(),
    type: Joi.string().valid('positive', 'negative').required(),
    category: categorySchema,
    description: descriptionSchema.required(),
    attachments: Joi.array().items(attachmentSchema).max(5).optional(),
    notifyParent: Joi.boolean().default(true),
  }),
};

const updateBehaviorSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    type: Joi.string().valid('positive', 'negative').optional(),
    category: categorySchema,
    description: descriptionSchema.optional(),
    attachments: Joi.array().items(attachmentSchema).max(5).optional(),
    notifyParent: Joi.boolean().optional(),
  }),
};

module.exports = { createBehaviorSchema, updateBehaviorSchema };
