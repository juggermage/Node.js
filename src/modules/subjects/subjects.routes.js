const { Router } = require("express");
const validate = require("../../middleware/validate.middleware");
const controller = require("./subjects.controller");

const {
  idParamsSchema,
  createSubjectSchema,
  updateSubjectSchema,
  querySubjectsSchema
} = require("./subjects.validation");

const router = Router();

router.get("/", validate(querySubjectsSchema, "query"), controller.getAll);

router.get("/:id", validate(idParamsSchema, "params"), controller.getById);

router.post("/", validate(createSubjectSchema, "body"), controller.create);

router.patch(
  "/:id",
  validate(idParamsSchema, "params"),
  validate(updateSubjectSchema, "body"),
  controller.update
);

router.delete("/:id", validate(idParamsSchema, "params"), controller.remove);

module.exports = router;
