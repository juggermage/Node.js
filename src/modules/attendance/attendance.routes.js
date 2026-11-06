
const express = require("express");

const attendanceController = require("./attendance.controller");
const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");

const {
  attendanceIdSchema,
  listAttendanceSchema,
  createAttendanceSchema,
  updateAttendanceSchema
} = require("./attendance.validation");

const router = express.Router();

router.use(requireAuth);

router.get(
  "/",
  validate(listAttendanceSchema, "query"),
  attendanceController.getAll
);

router.get(
  "/:id",
  validate(attendanceIdSchema, "params"),
  attendanceController.getById
);

router.post(
  "/",
  authorizeRoles(
    "ADMIN",
    "MANAGER",
    "TEACHER",
    "EDUCATOR",
    "ASSISTANT"
  ),
  validate(createAttendanceSchema),
  attendanceController.create
);

router.patch(
  "/:id",
  authorizeRoles(
    "ADMIN",
    "MANAGER",
    "TEACHER",
    "EDUCATOR",
    "ASSISTANT"
  ),
  validate(attendanceIdSchema, "params"),
  validate(updateAttendanceSchema),
  attendanceController.update
);

router.delete(
  "/:id",
  authorizeRoles("ADMIN", "MANAGER"),
  validate(attendanceIdSchema, "params"),
  attendanceController.remove
);

module.exports = router;
