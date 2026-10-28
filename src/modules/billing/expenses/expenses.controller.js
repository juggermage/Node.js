const expensesService = require("./expenses.service");
const HTTP_STATUS = require("../../../utils/http-status");

async function getAll(req, res) {
  const filters = res.locals.validated.query;

  const expenses = await expensesService.getAll(filters);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: expenses
  });
}

async function getById(req, res) {
  const { id } = res.locals.validated.params;

  const expense = await expensesService.getById(id);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: expense
  });
}

async function create(req, res) {
  const data = res.locals.validated.body;

  const expense = await expensesService.create(data);

  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: expense
  });
}

module.exports = {
  getAll,
  getById,
  create
};
