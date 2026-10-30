const salariesService = require("./salaries.service");
const HTTP_STATUS = require("../../../utils/http-status");

async function getRates(req, res) {
  const rates = await salariesService.getRates(res.locals.validated.query);

  return res.status(HTTP_STATUS.OK).json({ success: true, data: rates });
}

async function createRate(req, res) {
  const rate = await salariesService.createRate(res.locals.validated.body);

  return res.status(HTTP_STATUS.CREATED).json({ success: true, data: rate });
}

async function createCalculations(req, res) {
  const calculations = await salariesService.createCalculations(res.locals.validated.body);

  return res.status(HTTP_STATUS.CREATED).json({ success: true, data: calculations });
}

async function getCalculations(req, res) {
  const calculations = await salariesService.getCalculations(res.locals.validated.query);

  return res.status(HTTP_STATUS.OK).json({ success: true, data: calculations });
}

async function getCalculationById(req, res) {
  const calculation = await salariesService.getCalculationById(res.locals.validated.params.id);

  return res.status(HTTP_STATUS.OK).json({ success: true, data: calculation });
}

async function cancelCalculation(req, res) {
  const calculation = await salariesService.cancelCalculation(res.locals.validated.params.id);

  return res.status(HTTP_STATUS.OK).json({ success: true, data: calculation });
}

module.exports = {
  getRates,
  createRate,
  createCalculations,
  getCalculations,
  getCalculationById,
  cancelCalculation
};
