const schedulesService = require("./schedules.service");
const HTTP_STATUS = require("../../utils/http-status");

async function getAll(req, res) {
  const filters = res.locals.validated.query;

  const schedules = await schedulesService.getAll(filters);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: schedules
  });
}

async function getById(req, res) {
  const { id } = res.locals.validated.params;

  const schedule = await schedulesService.getById(id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: schedule
  });
}

async function create(req, res) {
  const data = res.locals.validated.body;

  const schedule = await schedulesService.create(data);

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: schedule
  });
}

async function update(req, res) {
  const { id } = res.locals.validated.params;
  const data = res.locals.validated.body;

  const schedule = await schedulesService.update(id, data);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: schedule
  });
}

async function remove(req, res) {
  const { id } = res.locals.validated.params;

  await schedulesService.remove(id);

  return res.status(HTTP_STATUS.NO_CONTENT).send();
}

async function publish(req, res) {
  const { id } = res.locals.validated.params;

  const schedule = await schedulesService.publish(id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: schedule
  });
}

async function createItem(req, res) {
  const { id } = res.locals.validated.params;
  const data = res.locals.validated.body;

  const item = await schedulesService.createItem(id, data);

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: item
  });
}

async function updateItem(req, res) {
  const { id, itemId } = res.locals.validated.params;
  const data = res.locals.validated.body;

  const item = await schedulesService.updateItem(id, itemId, data);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: item
  });
}

async function removeItem(req, res) {
  const { id, itemId } = res.locals.validated.params;

  await schedulesService.removeItem(id, itemId);

  return res.status(HTTP_STATUS.NO_CONTENT).send();
}

async function cancelItem(req, res) {
  const { id, itemId } = res.locals.validated.params;
  const data = res.locals.validated.body;

  const item = await schedulesService.cancelItem(id, itemId, data);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: item
  });
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  publish,
  createItem,
  updateItem,
  removeItem,
  cancelItem
};
