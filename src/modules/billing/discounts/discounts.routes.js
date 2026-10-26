const { Router } = require("express");
const validate = require("../../../middleware/validate.middleware");
const controller = require("./discounts.controller");

const {
  createDiscountSchema,
  idParamsSchema,
  queryDiscountsSchema
} = require("./discounts.validation");

const router = Router();

router.get("/", validate(queryDiscountsSchema, "query"), controller.getAll);

router.post("/", validate(createDiscountSchema, "body"), controller.create);

router.get("/:id", validate(idParamsSchema, "params"), controller.getById);

router.patch("/:id/deactivate", validate(idParamsSchema, "params"), controller.deactivate);

module.exports = router;
