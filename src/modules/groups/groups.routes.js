const { Router } = require("express");

const controller = require("./groups.controller");
const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");

const {
  idParamsSchema,
  enrollmentParamsSchema,
  childParamsSchema,
  createGroupSchema,
  updateGroupSchema,
  queryGroupsSchema,
  enrollChildSchema
} = require("./groups.validation");

const router = Router();

router.use(requireAuth);

const readAccess = authorizeRoles(
  "ADMIN",
  "MANAGER",
  "PARENT",
  "TEACHER",
  "EDUCATOR",
  "ASSISTANT"
);

const managementAccess = authorizeRoles("ADMIN", "MANAGER");

router.get(
  "/",
  readAccess,
  validate(queryGroupsSchema, "query"),
  controller.getAll
);

router.post(
  "/",
  managementAccess,
  validate(createGroupSchema, "body"),
  controller.create
);

router.get(
  "/children/:childId/enrollments",
  readAccess,
  validate(childParamsSchema, "params"),
  controller.getChildHistory
);

router.patch(
  "/enrollments/:enrollmentId/complete",
  managementAccess,
  validate(enrollmentParamsSchema, "params"),
  controller.completeEnrollment
);

router.get(
  "/:id",
  readAccess,
  validate(idParamsSchema, "params"),
  controller.getById
);

router.patch(
  "/:id",
  managementAccess,
  validate(idParamsSchema, "params"),
  validate(updateGroupSchema, "body"),
  controller.update
);

router.delete(
  "/:id",
  managementAccess,
  validate(idParamsSchema, "params"),
  controller.remove
);

router.post(
  "/:id/enrollments",
  managementAccess,
  validate(idParamsSchema, "params"),
  validate(enrollChildSchema, "body"),
  controller.enrollChild
);

router.get(
  "/:id/enrollments",
  readAccess,
  validate(idParamsSchema, "params"),
  controller.getGroupHistory
);

module.exports = router;