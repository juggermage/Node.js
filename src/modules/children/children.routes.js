const express = require("express");
const childrenController = require("./children.controller");

const router = express.Router();

router.get("/", childrenController.getAll);
router.get("/:id", childrenController.getById);
router.post("/", childrenController.create);
router.patch("/:id", childrenController.update);
router.delete("/:id", childrenController.remove);

module.exports = router;
