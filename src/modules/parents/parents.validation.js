const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const phoneSchema = Joi.string()
  .pattern(/^\+[1-9]\d{7,14}$/)
  .messages({
    "string.pattern.base": "Phone must use international E.164 format, e.g. +380XXXXXXXXX"
  });

const emailSchema = Joi.string().trim().lowercase().email().max(254);

const idParamsSchema = Joi.object({
  id: objectId.required()
});

const createParentSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100).required(),
  lastName: Joi.string().trim().min(1).max(100).required(),
  phone: phoneSchema.required(),
  email: emailSchema.allow("", null)
});

const updateParentSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100),
  lastName: Joi.string().trim().min(1).max(100),
  phone: phoneSchema,
  email: emailSchema.allow("", null),
  status: Joi.string().valid("ACTIVE", "INACTIVE")
}).min(1);

const queryParentsSchema = Joi.object({
  search: Joi.string().trim().max(100).allow(""),
  status: Joi.string().valid("ACTIVE", "INACTIVE", "ARCHIVED")
});

module.exports = {
  idParamsSchema,
  createParentSchema,
  updateParentSchema,
  queryParentsSchema
};
