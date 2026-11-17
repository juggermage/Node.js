const { Router } = require("express");

const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");

const controller = require("./child-parent.controller");

const {
  createLinkSchema,
  updateLinkSchema,
  idParamsSchema,
  childParamsSchema,
  parentParamsSchema,
  historyQuerySchema,
  listQuerySchema
} = require("./child-parent.validation");

const router = Router();

router.use(requireAuth);

const readAccess = authorizeRoles("ADMIN", "MANAGER", "PARENT", "TEACHER", "EDUCATOR", "ASSISTANT");

const managementAccess = authorizeRoles("ADMIN", "MANAGER");

router.get("/", readAccess, validate(listQuerySchema, "query"), controller.getAll);

router.post("/", managementAccess, validate(createLinkSchema, "body"), controller.create);

router.get(
  "/child/:childId",
  readAccess,
  validate(childParamsSchema, "params"),
  validate(historyQuerySchema, "query"),
  controller.getForChild
);

router.get(
  "/parent/:parentId",
  readAccess,
  validate(parentParamsSchema, "params"),
  validate(historyQuerySchema, "query"),
  controller.getForParent
);

router.get("/:id", readAccess, validate(idParamsSchema, "params"), controller.getById);

router.patch(
  "/:id",
  managementAccess,
  validate(idParamsSchema, "params"),
  validate(updateLinkSchema, "body"),
  controller.update
);

router.patch(
  "/:id/complete",
  managementAccess,
  validate(idParamsSchema, "params"),
  controller.complete
);

module.exports = router;
