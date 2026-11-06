const { Router } = require("express");

const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");

const controller = require("./staff-assignments.controller");

const {
  createAssignmentSchema,
  idParamsSchema,
  groupParamsSchema,
  employeeParamsSchema
} = require("./staff-assignments.validation");

const router = Router();

router.use(requireAuth);

const readAccess = authorizeRoles("ADMIN", "MANAGER", "TEACHER", "EDUCATOR", "ASSISTANT");

const managementAccess = authorizeRoles("ADMIN", "MANAGER");

router.get("/", readAccess, controller.getAll);

router.post("/", managementAccess, validate(createAssignmentSchema, "body"), controller.create);

router.get(
  "/group/:groupId",
  readAccess,
  validate(groupParamsSchema, "params"),
  controller.getGroupAssignments
);

router.get(
  "/employee/:employeeId",
  readAccess,
  validate(employeeParamsSchema, "params"),
  controller.getEmployeeAssignments
);

router.patch(
  "/:id/complete",
  managementAccess,
  validate(idParamsSchema, "params"),
  controller.complete
);

module.exports = router;
