
const { Router } = require("express");

const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");

const controller = require("./employees.controller");

const {
  idParamsSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  queryEmployeesSchema
} = require("./employees.validation");

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
  validate(queryEmployeesSchema, "query"),
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
  validate(createEmployeeSchema, "body"),
  controller.create
);

router.patch(
  "/:id",
  managementAccess,
  validate(idParamsSchema, "params"),
  validate(updateEmployeeSchema, "body"),
  controller.update
);

router.delete(
  "/:id",
  managementAccess,
  validate(idParamsSchema, "params"),
  controller.remove
);

module.exports = router;
