const express = require("express");

const schedulesController = require("./schedules.controller");
const validate = require("../../middleware/validate.middleware");

const {
  scheduleIdSchema,
  itemParamsSchema,
  listSchedulesSchema,
  createScheduleSchema,
  updateScheduleSchema,
  createItemSchema,
  updateItemSchema
} = require("./schedules.validation");

const router = express.Router();

router.get("/", validate(listSchedulesSchema, "query"), schedulesController.getAll);

router.post("/", validate(createScheduleSchema), schedulesController.create);

router.get("/:id", validate(scheduleIdSchema, "params"), schedulesController.getById);

router.patch(
  "/:id",
  validate(scheduleIdSchema, "params"),
  validate(updateScheduleSchema),
  schedulesController.update
);

router.post("/:id/publish", validate(scheduleIdSchema, "params"), schedulesController.publish);

router.post(
  "/:id/items",
  validate(scheduleIdSchema, "params"),
  validate(createItemSchema),
  schedulesController.createItem
);

router.patch(
  "/:id/items/:itemId",
  validate(itemParamsSchema, "params"),
  validate(updateItemSchema),
  schedulesController.updateItem
);

router.delete(
  "/:id/items/:itemId",
  validate(itemParamsSchema, "params"),
  schedulesController.removeItem
);

module.exports = router;
