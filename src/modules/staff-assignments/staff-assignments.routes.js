const { Router } = require("express");
const validate = require("../../middleware/validate.middleware");
const controller = require("./staff-assignments.controller");

const {
  createAssignmentSchema,
  idParamsSchema,
  groupParamsSchema,
  employeeParamsSchema
} = require("./staff-assignments.validation");

const router = Router();

router.get("/", controller.getAll);

router.post("/", validate(createAssignmentSchema, "body"), controller.create);

router.get(
  "/group/:groupId",
  validate(groupParamsSchema, "params"),
  controller.getGroupAssignments
);

router.get(
  "/employee/:employeeId",
  validate(employeeParamsSchema, "params"),
  controller.getEmployeeAssignments
);

router.patch("/:id/complete", validate(idParamsSchema, "params"), controller.complete);

module.exports = router;
