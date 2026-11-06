const express = require("express");

const roomsController = require("./rooms.controller");
const validate = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/auth.middleware");
const authorizeRoles = require("../../middleware/rbac.middleware");

const {
  createRoomSchema,
  updateRoomSchema,
  roomIdSchema,
  searchRoomSchema
} = require("./rooms.validation");

const router = express.Router();

router.use(requireAuth);

const readAccess = authorizeRoles("ADMIN", "MANAGER", "TEACHER", "EDUCATOR", "ASSISTANT");

const managementAccess = authorizeRoles("ADMIN", "MANAGER");

router.get("/", readAccess, validate(searchRoomSchema, "query"), roomsController.getAll);

router.get("/:id", readAccess, validate(roomIdSchema, "params"), roomsController.getById);

router.post("/", managementAccess, validate(createRoomSchema, "body"), roomsController.create);

router.patch(
  "/:id",
  managementAccess,
  validate(roomIdSchema, "params"),
  validate(updateRoomSchema, "body"),
  roomsController.update
);

router.delete("/:id", managementAccess, validate(roomIdSchema, "params"), roomsController.remove);

module.exports = router;
