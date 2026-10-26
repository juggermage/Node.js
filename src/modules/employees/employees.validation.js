const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const employeeRoles = ["MANAGER", "TEACHER", "EDUCATOR", "ASSISTANT"];

const idParamsSchema = Joi.object({
  id: objectId.required()
});

const createEmployeeSchema = Joi.object({
  employeeCode: Joi.string().trim().min(1).max(30).required(),
  firstName: Joi.string().trim().min(1).max(100).required(),
  lastName: Joi.string().trim().min(1).max(100).required(),
  role: Joi.string()
    .valid(...employeeRoles)
    .required(),
  phone: Joi.string().trim().max(30).allow("", null),
  email: Joi.string().email().allow("", null)
});

const updateEmployeeSchema = Joi.object({
  employeeCode: Joi.string().trim().min(1).max(30),
  firstName: Joi.string().trim().min(1).max(100),
  lastName: Joi.string().trim().min(1).max(100),
  role: Joi.string().valid(...employeeRoles),
  phone: Joi.string().trim().max(30).allow("", null),
  email: Joi.string().email().allow("", null),
  status: Joi.string().valid("ACTIVE", "INACTIVE")
}).min(1);

const queryEmployeesSchema = Joi.object({
  search: Joi.string().trim().allow(""),
  role: Joi.string().valid(...employeeRoles),
  status: Joi.string().valid("ACTIVE", "INACTIVE", "ARCHIVED")
});

module.exports = {
  idParamsSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  queryEmployeesSchema
};
