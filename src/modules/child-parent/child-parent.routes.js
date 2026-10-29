const { Router } = require("express");
const validate = require("../../middleware/validate.middleware");
const controller = require("./child-parent.controller");

const {
  createLinkSchema,
  idParamsSchema,
  childParamsSchema,
  parentParamsSchema
} = require("./child-parent.validation");

const router = Router();

router.post("/", validate(createLinkSchema, "body"), controller.create);

router.get("/child/:childId", validate(childParamsSchema, "params"), controller.getForChild);

router.get("/parent/:parentId", validate(parentParamsSchema, "params"), controller.getForParent);

router.get("/:id", validate(idParamsSchema, "params"), controller.getById);

router.patch("/:id/complete", validate(idParamsSchema, "params"), controller.complete);

module.exports = router;
