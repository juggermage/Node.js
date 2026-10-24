const Joi = require("joi");
const { ExpenseCategory } = require("@prisma/client");

const CATEGORIES = Object.values(ExpenseCategory);

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
    "any.invalid": "Date must be a real calendar date"
  });

const createExpenseSchema = Joi.object({
  category: Joi.string()
    .valid(...CATEGORIES)
    .required(),
  description: Joi.string().trim().min(1).max(500).required(),
  amount: Joi.number().integer().positive().required().messages({
    "number.base": "amount must be a number (in kopecks)",
    "number.integer": "amount must be an integer number of kopecks",
    "number.positive": "amount must be greater than 0",
    "number.unsafe": "amount is too large"
  }),
  expenseDate: dateSchema.required()
});

const expenseIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
});

const listExpensesSchema = Joi.object({
  category: Joi.string().valid(...CATEGORIES),
  from: dateSchema,
  to: dateSchema
}).custom((value, helpers) => {
  if (value.from && value.to && value.from > value.to) {
    return helpers.message("from must not be later than to");
  }

  return value;
});

module.exports = {
  createExpenseSchema,
  expenseIdSchema,
  listExpensesSchema
};
