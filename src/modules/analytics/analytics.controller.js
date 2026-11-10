const service = require("./analytics.service");
const HTTP_STATUS = require("../../utils/http-status");

async function send(res, data) {
  return res.status(HTTP_STATUS.OK).json({ success: true, data });
}

async function getSummary(req, res) {
  return send(res, await service.getSummary(res.locals.validated.query));
}

async function getIncomeReport(req, res) {
  return send(res, await service.getIncomeReport(res.locals.validated.query));
}

async function getExpensesReport(req, res) {
  return send(res, await service.getExpensesReport(res.locals.validated.query));
}

async function getDebtsReport(req, res) {
  return send(res, await service.getDebtsReport(res.locals.validated.query));
}

async function getProfitabilityReport(req, res) {
  return send(res, await service.getProfitabilityReport(res.locals.validated.query));
}

async function getGroupReport(req, res) {
  return send(res, await service.getGroupReport(res.locals.validated.query));
}

async function getAttendanceReport(req, res) {
  return send(res, await service.getAttendanceReport(res.locals.validated.query));
}

module.exports = {
  getSummary,
  getIncomeReport,
  getExpensesReport,
  getDebtsReport,
  getProfitabilityReport,
  getGroupReport,
  getAttendanceReport
};



