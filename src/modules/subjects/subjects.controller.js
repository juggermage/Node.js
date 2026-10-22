const subjectsService = require("./subjects.service");

function handleError(error, res, next) {
  if (error.status && error.code) {
    return res.status(error.status).json({
      success: false,
      error: {
        code: error.code,
        message: error.message
      }
    });
  }

  return next(error);
}

function getAll(req, res, next) {
  try {
    const data = subjectsService.getAll(req.query.search);

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return handleError(error, res, next);
  }
}

function getById(req, res) {
  const subject = subjectsService.getById(req.params.id);

  if (!subject) {
    return res.status(404).json({
      success: false,
      error: {
        code: "SUBJECT_NOT_FOUND",
        message: "Subject not found"
      }
    });
  }

  return res.status(200).json({
    success: true,
    data: subject
  });
}

function create(req, res, next) {
  try {
    const subject = subjectsService.create(req.body);

    return res.status(201).json({
      success: true,
      data: subject
    });
  } catch (error) {
    return handleError(error, res, next);
  }
}

function update(req, res, next) {
  try {
    const subject = subjectsService.update(req.params.id, req.body);

    if (!subject) {
      return res.status(404).json({
        success: false,
        error: {
          code: "SUBJECT_NOT_FOUND",
          message: "Subject not found"
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: subject
    });
  } catch (error) {
    return handleError(error, res, next);
  }
}

function remove(req, res) {
  const deleted = subjectsService.remove(req.params.id);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: {
        code: "SUBJECT_NOT_FOUND",
        message: "Subject not found"
      }
    });
  }

  return res.status(204).send();
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
