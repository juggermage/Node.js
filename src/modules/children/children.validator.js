const Joi = require("joi");

const birthDateSchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value ||
      date > new Date()
    ) {
      return helpers.error("any.invalid");
    }

    return value;
  })
  .messages({
    "string.pattern.base": "birthDate must be in YYYY-MM-DD format",
    "any.invalid": "birthDate must be a valid, non-future date"
  });

const createChildSchema = Joi.object({
  firstName: Joi.string().trim().min(1).required(),
  lastName: Joi.string().trim().min(1).required(),
  birthDate: birthDateSchema.required(),
  dietaryNotes: Joi.string().allow("", null),
  notes: Joi.string().allow("", null)
});

const updateChildSchema = Joi.object({
  firstName: Joi.string().trim().min(1),
  lastName: Joi.string().trim().min(1),
  birthDate: birthDateSchema,
  dietaryNotes: Joi.string().allow("", null),
  notes: Joi.string().allow("", null)
}).min(1);

const childIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
});

const searchChildSchema = Joi.object({
  search: Joi.string().trim().allow("")
});

module.exports = {
  createChildSchema,
  updateChildSchema,
  childIdSchema,
  searchChildSchema
};
