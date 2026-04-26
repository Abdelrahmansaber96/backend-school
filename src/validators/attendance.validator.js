const Joi = require('joi');
const objectId = Joi.string().hex().length(24);
const attendanceType = Joi.string().valid('absence', 'late', 'permission');
const attendanceNotes = Joi.string().max(500).allow('').optional();

const createAttendanceSchema = {
  body: Joi.object({
    studentId: objectId.required(),
    classId: objectId.required(),
    type: attendanceType.required(),
    date: Joi.date().iso().max('now').required().messages({
      'date.max': 'Attendance date cannot be in the future',
    }),
    notes: attendanceNotes,
  }),
};

const bulkAttendanceSchema = {
  body: Joi.object({
    classId: objectId.required(),
    date: Joi.date().iso().max('now').required(),
    type: attendanceType.optional(),
    notes: attendanceNotes,
    studentIds: Joi.array().items(objectId).min(1).optional(),
    records: Joi.array()
      .items(
        Joi.object({
          studentId: objectId.required(),
          type: attendanceType.required(),
          notes: attendanceNotes,
        }),
      )
      .min(1)
      .optional(),
  })
    .custom((value, helpers) => {
      const hasRecords = Array.isArray(value.records) && value.records.length > 0;
      const hasStudentIds = Array.isArray(value.studentIds) && value.studentIds.length > 0;

      if (!hasRecords && !hasStudentIds) {
        return helpers.error('any.custom', { message: 'records or studentIds is required' });
      }

      if (hasRecords && hasStudentIds) {
        return helpers.error('any.custom', { message: 'Use either records or studentIds, not both' });
      }

      if (hasStudentIds && !value.type) {
        return helpers.error('any.custom', { message: 'type is required when using studentIds' });
      }

      return value;
    }, 'bulk attendance payload validation')
    .messages({
      'any.custom': '{{#message}}',
    }),
};

const updateAttendanceSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    type: attendanceType.optional(),
    notes: attendanceNotes,
  }),
};

module.exports = { createAttendanceSchema, bulkAttendanceSchema, updateAttendanceSchema };
