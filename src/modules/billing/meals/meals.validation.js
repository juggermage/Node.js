const Joi = require("joi");

const ageYears = Joi.number().integer().min(2).max(5);
const objectId = Joi.string().hex().length(24);

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

const createMealRateSchema = Joi.object({
  ageYears: ageYears.required(),
  amount: Joi.number().integer().positive().max(Number.MAX_SAFE_INTEGER).required(),
  validFrom: isoDate.required(),
  validTo: isoDate.allow(null)
})
  .custom((value, helpers) => {
    if (value.validTo && value.validTo < value.validFrom) {
      return helpers.error("any.custom");
    }

    return value;
  })
  .messages({
    "any.custom": "validTo must not be earlier than validFrom"
  });

const rateQuerySchema = Joi.object({
  ageYears,
  onDate: isoDate
});

const calculateMealSchema = Joi.object({
  childId: objectId.required(),
  periodStart: isoDate.required(),
  periodEnd: isoDate.required(),
  attendedDays: Joi.number().integer().min(0).required(),
  ageYears
})
  .custom((value, helpers) => {
    if (value.periodStart > value.periodEnd) {
      return helpers.error("any.custom");
    }

    return value;
  })
  .messages({
    "any.custom": "periodStart must not be later than periodEnd"
  });

module.exports = {
  createMealRateSchema,
  rateQuerySchema,
  calculateMealSchema
};
