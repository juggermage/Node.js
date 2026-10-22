const childrenService = require("./children.service");

function getAll(req, res) {
  const data = childrenService.getAll(req.query.search);
  if (data === null) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_SEARCH", message: "Invalid search parameter" }
    });
  }
  return res.status(200).json({ success: true, data });
}

function getById(req, res) {
  const child = childrenService.getById(req.params.id);
  if (!child) {
    return res.status(404).json({
      success: false,
      error: { code: "CHILD_NOT_FOUND", message: "Child not found" }
    });
  }
  return res.status(200).json({ success: true, data: child });
}

function create(req, res) {
  const error = childrenService.validateChild(req.body);
  if (error) {
    return res.status(422).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: error }
    });
  }
  const child = childrenService.create(req.body);
  return res.status(201).json({ success: true, data: child });
}

function update(req, res) {
  const existing = childrenService.getById(req.params.id);
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: { code: "CHILD_NOT_FOUND", message: "Child not found" }
    });
  }
  const error = childrenService.validateChild(req.body, true);
  if (error) {
    return res.status(422).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: error }
    });
  }
  const child = childrenService.update(req.params.id, req.body);
  return res.status(200).json({ success: true, data: child });
}

function remove(req, res) {
  if (!childrenService.remove(req.params.id)) {
    return res.status(404).json({
      success: false,
      error: { code: "CHILD_NOT_FOUND", message: "Child not found" }
    });
  }
  return res.status(204).send();
}

module.exports = { getAll, getById, create, update, remove };
