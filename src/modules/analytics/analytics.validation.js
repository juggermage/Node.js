const Joi = require("joi");

const isoDate = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      return helpers.error("date.invalid");
    }

    return value;
  })
  .messages({
    "string.pattern.base": "Date must use YYYY-MM-DD format",
    "date.invalid": "Date must be a valid calendar date"
  });

const periodSchema = Joi.object({
  from: isoDate.required(),
  to: isoDate.required()
})
  .custom((value, helpers) => {
    if (value.from > value.to) {
      return helpers.error("any.custom");
    }

    return value;
  })
  .messages({
    "any.custom": "from must not be later than to"
  });

const attendanceReportSchema = periodSchema.keys({
  groupId: Joi.string().hex().length(24).optional()
});

module.exports = {
  periodSchema,
  attendanceReportSchema
};
