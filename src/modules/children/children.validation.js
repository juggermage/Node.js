const Joi = require("joi");

const birthDateSchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    const today = new Date();

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value ||
      date > today
    ) {
      return helpers.error("any.invalid");
    }

    let age = today.getUTCFullYear() - date.getUTCFullYear();

    const birthdayPassed =
      today.getUTCMonth() > date.getUTCMonth() ||
      (
        today.getUTCMonth() === date.getUTCMonth() &&
        today.getUTCDate() >= date.getUTCDate()
      );

    if (!birthdayPassed) {
      age--;
    }

    if (age < 2 || age > 5) {
      return helpers.error("date.ageRange");
    }

    return value;
  })
  .messages({
    "string.pattern.base": "birthDate must be in YYYY-MM-DD format",
    "any.invalid": "birthDate must be a valid, non-future date",
    "date.ageRange": "Child must be between 2 and 5 years old"
  });

const createChildSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100).required(),
  lastName: Joi.string().trim().min(1).max(100).required(),
  birthDate: birthDateSchema.required(),
  dietaryNotes: Joi.string().allow("", null),
  notes: Joi.string().allow("", null)
});

const updateChildSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100),
  lastName: Joi.string().trim().min(1).max(100),
  birthDate: birthDateSchema,
  dietaryNotes: Joi.string().allow("", null),
  notes: Joi.string().allow("", null),
  status: Joi.string().valid("ACTIVE", "INACTIVE")
}).min(1);

const childIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
});

const searchChildSchema = Joi.object({
  search: Joi.string().trim().allow("").max(100),
  status: Joi.string().valid("ACTIVE", "INACTIVE", "ARCHIVED"),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

module.exports = {
  createChildSchema,
  updateChildSchema,
  childIdSchema,
  searchChildSchema
};