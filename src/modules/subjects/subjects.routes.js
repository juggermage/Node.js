
const { Router } = require("express");

const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");

const controller = require("./subjects.controller");

const {
  idParamsSchema,
  createSubjectSchema,
  updateSubjectSchema,
  querySubjectsSchema
} = require("./subjects.validation");

const router = Router();

router.use(requireAuth);

const readAccess = authorizeRoles(
  "ADMIN",
  "MANAGER",
  "TEACHER",
  "EDUCATOR",
  "ASSISTANT"
);

const managementAccess = authorizeRoles("ADMIN", "MANAGER");

router.get(
  "/",
  readAccess,
  validate(querySubjectsSchema, "query"),
  controller.getAll
);

router.get(
  "/:id",
  readAccess,
  validate(idParamsSchema, "params"),
  controller.getById
);

router.post(
  "/",
  managementAccess,
  validate(createSubjectSchema, "body"),
  controller.create
);

router.patch(
  "/:id",
  managementAccess,
  validate(idParamsSchema, "params"),
  validate(updateSubjectSchema, "body"),
  controller.update
);

router.delete(
  "/:id",
  managementAccess,
  validate(idParamsSchema, "params"),
  controller.remove
);

module.exports = router;
