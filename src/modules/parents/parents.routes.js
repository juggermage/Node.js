const { Router } = require("express");

const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");

const controller = require("./parents.controller");

const {
  idParamsSchema,
  createParentSchema,
  updateParentSchema,
  queryParentsSchema
} = require("./parents.validation");

const router = Router();

router.use(requireAuth);

const readAccess = authorizeRoles("ADMIN", "MANAGER", "PARENT");
const managementAccess = authorizeRoles("ADMIN", "MANAGER");

router.get("/", readAccess, validate(queryParentsSchema, "query"), controller.getAll);

router.post("/", managementAccess, validate(createParentSchema, "body"), controller.create);

router.get("/:id/children", readAccess, validate(idParamsSchema, "params"), controller.getChildren);

router.get("/:id", readAccess, validate(idParamsSchema, "params"), controller.getById);

router.patch(
  "/:id",
  managementAccess,
  validate(idParamsSchema, "params"),
  validate(updateParentSchema, "body"),
  controller.update
);

router.delete("/:id", managementAccess, validate(idParamsSchema, "params"), controller.remove);

module.exports = router;
