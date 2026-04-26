const Joi = require('joi');
const objectId = Joi.string().hex().length(24);

const createConversationSchema = {
  body: Joi.object({
    participantId: objectId.required(),
  }),
};

const sendMessageSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    text: Joi.string().max(5000).optional(),
    attachments: Joi.array()
      .items(
        Joi.object({
          url: Joi.string().uri().required(),
          type: Joi.string().valid('image', 'document').required(),
          name: Joi.string().required(),
          size: Joi.number().optional(),
          publicId: Joi.string().optional(),
        }),
      )
      .max(5)
      .optional(),
  }).or('text', 'attachments'),
};

module.exports = { createConversationSchema, sendMessageSchema };
