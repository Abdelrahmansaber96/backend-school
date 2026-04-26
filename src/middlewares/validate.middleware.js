const ApiError = require('../utils/ApiError');

/**
 * Validates request using a Joi schema.
 * Schema can define: body, params, query properties.
 *
 * Usage:
 *   router.post('/', validate(schema), controller)
 */
const validate = (schema) => (req, res, next) => {
  const toValidate = {};
  if (schema.body) toValidate.body = req.body;
  if (schema.params) toValidate.params = req.params;
  if (schema.query) toValidate.query = req.query;

  const { error, value } = schema.validate
    ? schema.validate(toValidate, { abortEarly: false, allowUnknown: false })
    : validateParts(schema, toValidate);

  if (error) {
    const errors = error.details.map((d) => ({
      field: d.path.join('.'),
      message: d.message.replace(/"/g, ''),
    }));
    return next(new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', errors));
  }

  // Apply Joi-sanitized values (defaults, trims, transforms) back to the request
  if (value) {
    if (value.body !== undefined) req.body = value.body;
    if (value.params !== undefined) req.params = value.params;
    if (value.query !== undefined) req.query = value.query;
  }
  next();
};

// Validates each part independently when schema is an object of Joi schemas
const validateParts = (schema, data) => {
  const Joi = require('joi');
  const combinedSchema = Joi.object(schema);
  return combinedSchema.validate(data, { abortEarly: false });
};

module.exports = validate;
