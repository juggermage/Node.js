const express = require("express");

const childrenController = require("./children.controller");
const validate = require("../../middleware/validate.middleware");

const {
  createChildSchema,
  updateChildSchema,
  childIdSchema,
  searchChildSchema
} = require("./children.validation");

const router = express.Router();

router.get("/", validate(searchChildSchema, "query"), childrenController.getAll);

router.get("/:id", validate(childIdSchema, "params"), childrenController.getById);

router.post("/", validate(createChildSchema), childrenController.create);

router.patch(
  "/:id",
  validate(childIdSchema, "params"),
  validate(updateChildSchema),
  childrenController.update
);

router.delete("/:id", validate(childIdSchema, "params"), childrenController.remove);

module.exports = router;
