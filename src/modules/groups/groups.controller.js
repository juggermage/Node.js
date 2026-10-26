const service = require("./groups.service");
const { HTTP_STATUS } = require("../../utils/http-status");

async function getAll(req, res) {
  const data = await service.getAllGroups(res.locals.validated.query);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function getById(req, res) {
  const data = await service.getGroupById(res.locals.validated.params.id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function create(req, res) {
  const data = await service.createGroup(res.locals.validated.body);

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data
  });
}

async function update(req, res) {
  const data = await service.updateGroup(res.locals.validated.params.id, res.locals.validated.body);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function remove(req, res) {
  await service.softDeleteGroup(res.locals.validated.params.id);

  return res.status(HTTP_STATUS.NO_CONTENT).send();
}

async function enrollChild(req, res) {
  const data = await service.enrollChild(res.locals.validated.params.id, res.locals.validated.body);

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data
  });
}

async function completeEnrollment(req, res) {
  const data = await service.completeEnrollment(res.locals.validated.params.enrollmentId);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function transferChild(req, res) {
  const data = await service.transferChild(res.locals.validated.body);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function getGroupHistory(req, res) {
  const data = await service.getGroupHistory(res.locals.validated.params.id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function getChildHistory(req, res) {
  const data = await service.getChildHistory(res.locals.validated.params.childId);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  enrollChild,
  completeEnrollment,
  transferChild,
  getGroupHistory,
  getChildHistory
};
