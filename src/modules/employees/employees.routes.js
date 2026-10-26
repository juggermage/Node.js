const { Router } = require("express");
const validate = require("../../middleware/validate.middleware");
const controller = require("./employees.controller");

const {
  idParamsSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  queryEmployeesSchema
} = require("./employees.validation");

const router = Router();

router.get("/", validate(queryEmployeesSchema, "query"), controller.getAll);

router.get("/:id", validate(idParamsSchema, "params"), controller.getById);

router.post("/", validate(createEmployeeSchema, "body"), controller.create);

router.patch(
  "/:id",
  validate(idParamsSchema, "params"),
  validate(updateEmployeeSchema, "body"),
  controller.update
);

router.delete("/:id", validate(idParamsSchema, "params"), controller.remove);

module.exports = router;
