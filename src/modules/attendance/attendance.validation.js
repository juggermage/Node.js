const Joi = require("joi");

const objectIdSchema = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);

const dateSchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      return helpers.error("any.invalid");
    }

    return value;
  })
  .messages({
    "string.pattern.base": "Date must be in YYYY-MM-DD format",
    "any.invalid": "Date must be a valid calendar date"
  });

const timeSchema = Joi.string().pattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

const attendanceStatusSchema = Joi.string().valid("PRESENT", "ABSENT", "LATE", "EXCUSED");

const attendanceIdSchema = Joi.object({
  id: objectIdSchema.required()
});

const listAttendanceSchema = Joi.object({
  childId: objectIdSchema,
  groupId: objectIdSchema,
  status: attendanceStatusSchema,
  date: dateSchema,
  from: dateSchema,
  to: dateSchema
})
  .custom((value, helpers) => {
    if (value.from && value.to && value.from > value.to) {
      return helpers.error("date.invalidRange");
    }

    return value;
  })
  .messages({
    "date.invalidRange": "from must not be later than to"
  });

const createAttendanceSchema = Joi.object({
  childId: objectIdSchema.required(),
  date: dateSchema.required(),
  status: attendanceStatusSchema.default("PRESENT"),
  checkIn: timeSchema.allow(null),
  checkOut: timeSchema.allow(null),
  note: Joi.string().trim().max(1000).allow("", null)
})
  .custom((value, helpers) => {
    if (value.checkIn && value.checkOut && value.checkOut <= value.checkIn) {
      return helpers.error("any.invalid");
    }

    return value;
  })
  .messages({
    "any.invalid": "checkOut must be later than checkIn"
  });

const updateAttendanceSchema = Joi.object({
  date: dateSchema,
  status: attendanceStatusSchema,
  checkIn: timeSchema.allow(null),
  checkOut: timeSchema.allow(null),
  note: Joi.string().trim().max(1000).allow("", null)
})
  .min(1)
  .custom((value, helpers) => {
    if (value.checkIn && value.checkOut && value.checkOut <= value.checkIn) {
      return helpers.error("any.invalid");
    }

    return value;
  })
  .messages({
    "any.invalid": "checkOut must be later than checkIn"
  });

module.exports = {
  attendanceIdSchema,
  listAttendanceSchema,
  createAttendanceSchema,
  updateAttendanceSchema
};
