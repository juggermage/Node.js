const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createLinkSchema = Joi.object({
  childId: objectId.required(),
  parentId: objectId.required(),
  relation: Joi.string()
    .valid("MOTHER", "FATHER", "GUARDIAN", "GRANDPARENT", "OTHER")
    .required()
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

module.exports = {
  createLinkSchema,
  idParamsSchema,
  childParamsSchema,
  parentParamsSchema
};