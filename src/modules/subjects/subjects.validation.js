const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const idParamsSchema = Joi.object({
  id: objectId.required()
});

const createSubjectSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().trim().max(1000).allow(null, "")
});

const updateSubjectSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100),
  description: Joi.string().trim().max(1000).allow(null, ""),
  status: Joi.string().valid("ACTIVE", "INACTIVE")
}).min(1);

const querySubjectsSchema = Joi.object({
  search: Joi.string().trim().allow(""),
  status: Joi.string().valid("ACTIVE", "INACTIVE", "ARCHIVED")
});

module.exports = {
  idParamsSchema,
  createSubjectSchema,
  updateSubjectSchema,
  querySubjectsSchema
};
