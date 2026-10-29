const { Router } = require("express");
const validate = require("../../middleware/validate.middleware");
const controller = require("./teacher-subjects.controller");

const {
  createAssignmentSchema,
  idParamsSchema,
  employeeParamsSchema
} = require("./teacher-subjects.validation");

const router = Router();

router.get("/", controller.getAll);

router.post("/", validate(createAssignmentSchema, "body"), controller.create);

router.get(
  "/employee/:employeeId",
  validate(employeeParamsSchema, "params"),
  controller.getTeacherSubjects
);

router.delete("/:id", validate(idParamsSchema, "params"), controller.remove);

module.exports = router;
