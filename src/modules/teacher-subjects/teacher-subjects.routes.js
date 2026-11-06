
const { Router } = require("express");

const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");

const controller = require("./teacher-subjects.controller");

const {
  createAssignmentSchema,
  idParamsSchema,
  employeeParamsSchema
} = require("./teacher-subjects.validation");

const router = Router();

router.use(requireAuth);

const readAccess = authorizeRoles(
  "ADMIN",
  "MANAGER",
  "TEACHER"
);

const managementAccess = authorizeRoles("ADMIN", "MANAGER");

router.get(
  "/",
  readAccess,
  controller.getAll
);

router.post(
  "/",
  managementAccess,
  validate(createAssignmentSchema, "body"),
  controller.create
);

router.get(
  "/employee/:employeeId",
  readAccess,
  validate(employeeParamsSchema, "params"),
  controller.getTeacherSubjects
);

router.delete(
  "/:id",
  managementAccess,
  validate(idParamsSchema, "params"),
  controller.remove
);

module.exports = router;
