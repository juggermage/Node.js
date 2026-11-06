const service = require("./groups.service");
const HTTP_STATUS = require("../../utils/http-status");

async function getAll(req, res) {
  const data = await service.getAllGroups(
    res.locals.validated.query,
    req.user
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function getById(req, res) {
  const data = await service.getGroupById(
    res.locals.validated.params.id,
    req.user
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function create(req, res) {
  const data = await service.createGroup(
    res.locals.validated.body,
    req.user
  );

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data
  });
}

async function update(req, res) {
  const data = await service.updateGroup(
    res.locals.validated.params.id,
    res.locals.validated.body,
    req.user
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function remove(req, res) {
  await service.softDeleteGroup(
    res.locals.validated.params.id,
    req.user
  );

  return res.status(HTTP_STATUS.NO_CONTENT).send();
}

async function enrollChild(req, res) {
  const data = await service.enrollChild(
    res.locals.validated.params.id,
    res.locals.validated.body,
    req.user
  );

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data
  });
}

async function completeEnrollment(req, res) {
  const data = await service.completeEnrollment(
    res.locals.validated.params.enrollmentId,
    req.user
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function getGroupHistory(req, res) {
  const data = await service.getGroupHistory(
    res.locals.validated.params.id,
    req.user
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function getChildHistory(req, res) {
  const data = await service.getChildHistory(
    res.locals.validated.params.childId,
    req.user
  );

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
  getGroupHistory,
  getChildHistory
};