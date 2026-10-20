const groupsService = require("./groups.service");

async function getAll(req, res, next) {
  try {
    const data = await groupsService.getAllGroups(req.query);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return handleError(error, res, next);
  }
}

async function getById(req, res, next) {
  try {
    const data = await groupsService.getGroupById(req.params.id);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return handleError(error, res, next);
  }
}

async function create(req, res, next) {
  try {
    const data = await groupsService.createGroup(req.body);
    return res.status(201).json({
      success: true,
      data
    });
  } catch (error) {
    return handleError(error, res, next);
  }
}

async function update(req, res, next) {
  try {
    const data = await groupsService.updateGroup(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return handleError(error, res, next);
  }
}

async function remove(req, res, next) {
  try {
    await groupsService.deleteGroup(req.params.id);
    return res.status(204).send();
  } catch (error) {
    return handleError(error, res, next);
  }
}

function handleError(error, res, next) {
  if (error.status) {
    return res.status(error.status).json({
      success: false,
      error: {
        code: error.code || "BAD_REQUEST",
        message: error.message
      }
    });
  }
  return next(error);
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};