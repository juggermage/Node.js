const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createLinkSchema = Joi.object({
  childId: objectId.required(),
  parentId: objectId.required(),
  relation: Joi.string().valid("MOTHER", "FATHER", "GUARDIAN", "GRANDPARENT", "OTHER").required()
});

const updateLinkSchema = Joi.object({
  childId: objectId.optional(),
  parentId: objectId.optional(),
  relation: Joi.string().valid("MOTHER", "FATHER", "GUARDIAN", "GRANDPARENT", "OTHER").required()
});

const idParamsSchema = Joi.object({
  id: objectId.required()
});

const childParamsSchema = Joi.object({
  childId: objectId.required()
});

const parentParamsSchema = Joi.object({
  parentId: objectId.required()
});

const historyQuerySchema = Joi.object({
  includeEnded: Joi.boolean().default(false)
});

const listQuerySchema = Joi.object({
  search: Joi.string().allow(""),
  includeEnded: Joi.boolean().default(false)
});

module.exports = {
  createLinkSchema,
  updateLinkSchema,
  idParamsSchema,
  childParamsSchema,
  parentParamsSchema,
  historyQuerySchema,
  listQuerySchema
};
