
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

    // Обчислюємо повний вік дитини
    let age = today.getUTCFullYear() - date.getUTCFullYear();

    const birthdayPassed =
      today.getUTCMonth() > date.getUTCMonth() ||
      (today.getUTCMonth() === date.getUTCMonth() &&
        today.getUTCDate() >= date.getUTCDate());

    if (!birthdayPassed) {
      age--;
    }

    // Дозволений вік: від 2 до 5 років включно
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

// Створення дитини
const createChildSchema = Joi.object({
  firstName: Joi.string().trim().min(1).required(),
  lastName: Joi.string().trim().min(1).required(),
  birthDate: birthDateSchema.required(),
  dietaryNotes: Joi.string().allow("", null),
  notes: Joi.string().allow("", null)
});

// Оновлення дитини
const updateChildSchema = Joi.object({
  firstName: Joi.string().trim().min(1),
  lastName: Joi.string().trim().min(1),
  birthDate: birthDateSchema,
  dietaryNotes: Joi.string().allow("", null),
  notes: Joi.string().allow("", null),
  status: Joi.string().valid("ACTIVE", "INACTIVE")
}).min(1);

// Перевірка ID дитини
const childIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
});

// Пошук і фільтрація дітей
const searchChildSchema = Joi.object({
  search: Joi.string().trim().allow(""),
  status: Joi.string().valid("ACTIVE", "INACTIVE", "ARCHIVED")
});

module.exports = {
  createChildSchema,
  updateChildSchema,
  childIdSchema,
  searchChildSchema
};
