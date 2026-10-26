const express = require("express");

const roomsController = require("./rooms.controller");
const validate = require("../../middleware/validate.middleware");

const {
  createRoomSchema,
  updateRoomSchema,
  roomIdSchema,
  searchRoomSchema
} = require("./rooms.validation");

const router = express.Router();

router.get("/", validate(searchRoomSchema, "query"), roomsController.getAll);

router.get("/:id", validate(roomIdSchema, "params"), roomsController.getById);

router.post("/", validate(createRoomSchema), roomsController.create);

router.patch(
  "/:id",
  validate(roomIdSchema, "params"),
  validate(updateRoomSchema),
  roomsController.update
);

router.delete("/:id", validate(roomIdSchema, "params"), roomsController.remove);

module.exports = router;
