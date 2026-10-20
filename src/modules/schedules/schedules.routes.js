// src/modules/schedules/schedules.routes.js
const express = require('express');
const scheduleController = require('./schedules.controller');

const router = express.Router();

router.get('/', scheduleController.getAll);
router.get('/:id', scheduleController.getById);
router.post('/', scheduleController.create);
router.patch('/:id', scheduleController.update);
router.delete('/:id', scheduleController.delete);

module.exports = router;