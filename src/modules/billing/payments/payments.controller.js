const paymentsService = require("./payments.service");
const HTTP_STATUS = require("../../../utils/http-status");

async function getAll(req, res) {
  const filters = res.locals.validated.query;
  const payments = await paymentsService.getAll(filters);

  return res.status(HTTP_STATUS.OK).json({ success: true, data: payments });
}

async function getById(req, res) {
  const { id } = res.locals.validated.params;
  const payment = await paymentsService.getById(id);

  return res.status(HTTP_STATUS.OK).json({ success: true, data: payment });
}

async function create(req, res) {
  const data = res.locals.validated.body;
  const payment = await paymentsService.create(data);

  return res.status(HTTP_STATUS.CREATED).json({ success: true, data: payment });
}

async function cancel(req, res) {
  const { id } = res.locals.validated.params;
  const payment = await paymentsService.cancel(id);

  return res.status(HTTP_STATUS.OK).json({ success: true, data: payment });
}

module.exports = { getAll, getById, create, cancel };
