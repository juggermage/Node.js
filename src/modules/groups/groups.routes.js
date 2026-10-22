const express = require("express");
const groupsController = require("./groups.controller");

const router = express.Router();

router.get("/", groupsController.getAll);
router.get("/:id", groupsController.getById);
router.post("/", groupsController.create);
router.patch("/:id", groupsController.update);
router.delete("/:id", groupsController.remove);

module.exports = router;
