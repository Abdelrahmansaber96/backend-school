const Joi = require('joi');

const objectId = Joi.string().hex().length(24);
const assessmentTypes = ['quiz', 'exam', 'assignment', 'project', 'midterm', 'final'];

const createGradeSchema = {
  body: Joi.object({
    studentId: objectId.required(),
    subjectId: objectId.required(),
    classId: objectId.required(),
    teacherId: objectId.optional(),
    title: Joi.string().min(2).max(120).required(),
    assessmentType: Joi.string().valid(...assessmentTypes).required(),
    score: Joi.number().min(0).required(),
    maxScore: Joi.number().min(1).required(),
    examDate: Joi.date().iso().required(),
    term: Joi.string().max(50).allow('', null).optional(),
    notes: Joi.string().max(500).allow('', null).optional(),
    academicYear: Joi.string().pattern(/^\d{4}-\d{4}$/).optional(),
    isPublished: Joi.boolean().optional(),
  }),
};

const updateGradeSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    studentId: objectId.optional(),
    subjectId: objectId.optional(),
    classId: objectId.optional(),
    teacherId: objectId.allow(null).optional(),
    title: Joi.string().min(2).max(120).optional(),
    assessmentType: Joi.string().valid(...assessmentTypes).optional(),
    score: Joi.number().min(0).optional(),
    maxScore: Joi.number().min(1).optional(),
    examDate: Joi.date().iso().optional(),
    term: Joi.string().max(50).allow('', null).optional(),
    notes: Joi.string().max(500).allow('', null).optional(),
    academicYear: Joi.string().pattern(/^\d{4}-\d{4}$/).optional(),
    isPublished: Joi.boolean().optional(),
  }).min(1),
};

module.exports = {
  createGradeSchema,
  updateGradeSchema,
};