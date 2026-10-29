const { Router } = require("express");
const validate = require("../../middleware/validate.middleware");
const controller = require("./parents.controller");

const {
  idParamsSchema,
  createParentSchema,
  updateParentSchema,
  queryParentsSchema
} = require("./parents.validation");

const router = Router();

router.get("/", validate(queryParentsSchema, "query"), controller.getAll);

router.post("/", validate(createParentSchema, "body"), controller.create);

router.get("/:id/children", validate(idParamsSchema, "params"), controller.getChildren);

router.get("/:id", validate(idParamsSchema, "params"), controller.getById);

router.patch(
  "/:id",
  validate(idParamsSchema, "params"),
  validate(updateParentSchema, "body"),
  controller.update
);

router.delete("/:id", validate(idParamsSchema, "params"), controller.remove);

module.exports = router;
