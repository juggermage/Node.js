const service = require("./tuition.service");
const HTTP_STATUS = require("../../../utils/http-status");

async function getRates(req, res) {
  const data = await service.getAllRates(
    res.locals.validated.query
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function createRate(req, res) {
  const data = await service.createRate(
    res.locals.validated.body,
    req.user.id
  );

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data
  });
}

async function calculateMonthly(req, res) {
  const data = await service.calculateMonthlyTuitionCost(
    res.locals.validated.body
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

async function calculateAnnual(req, res) {
  const data = await service.calculateAnnualTuitionCost(
    res.locals.validated.body
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data
  });
}

module.exports = {
  getRates,
  createRate,
  calculateMonthly,
  calculateAnnual
};