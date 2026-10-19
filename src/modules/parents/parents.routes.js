const express = require("express");
const parentsController = require("./parents.controller");

const router = express.Router();

router.get("/", parentsController.getParents);
router.post("/", parentsController.createParent);
router.get("/:id", parentsController.getParentById);
router.patch("/:id", parentsController.updateParent);
router.delete("/:id", parentsController.deleteParent);

module.exports = router;