const roomsService = require("./rooms.service");
const HTTP_STATUS = require("../../utils/http-status");

async function getAll(req, res) {
  const filters = res.locals.validated.query;
  const rooms = await roomsService.getAll(filters);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: rooms
  });
}

async function getById(req, res) {
  const { id } = res.locals.validated.params;
  const room = await roomsService.getById(id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: room
  });
}

async function create(req, res) {
  const room = await roomsService.create(res.locals.validated.body);

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: room
  });
}

async function update(req, res) {
  const { id } = res.locals.validated.params;

  const room = await roomsService.update(id, res.locals.validated.body);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: room
  });
}

async function remove(req, res) {
  const { id } = res.locals.validated.params;

  await roomsService.remove(id);

  return res.status(HTTP_STATUS.NO_CONTENT).send();
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
