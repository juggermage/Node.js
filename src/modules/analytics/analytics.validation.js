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
  from: isoDate,
  to: isoDate,
  periodType: Joi.string().valid("MONTH", "QUARTER", "YEAR"),
  year: Joi.number().integer().min(2000).max(2100),
  month: Joi.number().integer().min(1).max(12),
  quarter: Joi.number().integer().min(1).max(4),
  compareFrom: isoDate,
  compareTo: isoDate
})
  .custom((value, helpers) => {
    const hasRange = Boolean(value.from && value.to);
    const hasPeriod = Boolean(value.periodType && value.year);
    if (hasRange === hasPeriod) return helpers.error("period.selection");
    if (hasRange && value.from > value.to) return helpers.error("period.range");
    if (hasPeriod && value.periodType === "MONTH" && !value.month)
      return helpers.error("period.month");
    if (hasPeriod && value.periodType === "QUARTER" && !value.quarter)
      return helpers.error("period.quarter");
    if (hasPeriod && value.periodType !== "MONTH" && value.month)
      return helpers.error("period.unexpectedMonth");
    if (hasPeriod && value.periodType !== "QUARTER" && value.quarter)
      return helpers.error("period.unexpectedQuarter");
    if (Boolean(value.compareFrom) !== Boolean(value.compareTo))
      return helpers.error("period.comparison");
    if (value.compareFrom && value.compareFrom > value.compareTo)
      return helpers.error("period.comparisonRange");
    return value;
  })
  .messages({
    "period.selection": "Specify either from/to or periodType/year",
    "period.range": "from must not be later than to",
    "period.month": "month is required for MONTH reports",
    "period.quarter": "quarter is required for QUARTER reports",
    "period.unexpectedMonth": "month is only allowed for MONTH reports",
    "period.unexpectedQuarter": "quarter is only allowed for QUARTER reports",
    "period.comparison": "compareFrom and compareTo must be provided together",
    "period.comparisonRange": "compareFrom must not be later than compareTo"
  });

const attendanceReportSchema = periodSchema.keys({
  groupId: Joi.string().hex().length(24).optional()
});

module.exports = { periodSchema, attendanceReportSchema };
