const Joi = require("joi");

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

const periodFields = {
  childId: objectId.required(),
  payerId: objectId.required(),
  periodYear: Joi.number().integer().min(2000).max(2100).required(),
  periodMonth: Joi.number().integer().min(1).max(12).required(),
  dueDate: isoDate
};

const createMonthlyInvoiceSchema = Joi.object({
  ...periodFields,
  attendedDays: Joi.number().integer().min(0).max(31).required()
})
  .custom((value, helpers) => {
    const daysInMonth = new Date(Date.UTC(value.periodYear, value.periodMonth, 0)).getUTCDate();

    if (value.attendedDays > daysInMonth) {
      return helpers.error("any.custom");
    }

    return value;
  })
  .messages({
    "any.custom": "Attended days exceed the number of days in the month"
  });

const createAnnualInvoiceSchema = Joi.object(periodFields);

const invoiceQuerySchema = Joi.object({
  childId: objectId,
  payerId: objectId,
  periodYear: Joi.number().integer().min(2000).max(2100),
  periodMonth: Joi.number().integer().min(1).max(12),
  type: Joi.string().valid("MONTHLY", "ANNUAL", "ADJUSTMENT"),
  status: Joi.string().valid("DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED")
});

const invoiceIdSchema = Joi.object({
  id: objectId.required()
});

module.exports = {
  createMonthlyInvoiceSchema,
  createAnnualInvoiceSchema,
  invoiceQuerySchema,
  invoiceIdSchema
};
