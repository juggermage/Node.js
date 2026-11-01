const service = require("./invoices.service");
const HTTP_STATUS = require("../../../utils/http-status");

async function createMonthly(req, res) {
  const data = await service.createMonthly(res.locals.validated.body);

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data
  });
}

async function createAnnual(req, res) {
  const data = await service.createAnnual(res.locals.validated.body);

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data
  });
}

async function getAll(req, res) {
  const data = await service.getAll(res.locals.validated.query);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function getById(req, res) {
  const data = await service.getById(req.params.id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function cancel(req, res) {
  const data = await service.cancel(req.params.id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

module.exports = {
  createMonthly,
  createAnnual,
  getAll,
  getById,
  cancel
};
