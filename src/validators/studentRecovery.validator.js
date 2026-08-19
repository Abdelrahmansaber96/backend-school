const Joi = require('joi');
const password = Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required();
const identifySchema = { body: Joi.object({ nationalId: Joi.string().trim().required(), phone: Joi.string().trim().required() }) };
const submitSchema = { body: Joi.object({
  requestId: Joi.string().hex().length(24).required(), challengeToken: Joi.string().hex().length(64).required(),
  grade: Joi.string().trim().required(), classId: Joi.string().hex().length(24).required(),
}) };
const completeSchema = { body: Joi.object({
  requestId: Joi.string().hex().length(24).required(), otp: Joi.string().pattern(/^\d{4}$/).required(), newPassword: password,
}) };
const issueCodeSchema = { params: Joi.object({ id: Joi.string().hex().length(24).required() }) };
module.exports = { identifySchema, submitSchema, completeSchema, issueCodeSchema };
