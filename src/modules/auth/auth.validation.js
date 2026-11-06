
const Joi = require("joi");

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().trim().email().max(254).lowercase().required(),
  password: Joi.string().min(8).max(72).required()
});

const loginSchema = Joi.object({
  email: Joi.string().trim().email().max(254).lowercase().required(),
  password: Joi.string().min(1).max(72).required()
});

module.exports = {
  registerSchema,
  loginSchema
};
