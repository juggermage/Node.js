const AppError = require("../utils/app-error");
const HTTP_STATUS = require("../utils/http-status");

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message
      }
    });
  }

  console.error(err);

  return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error"
    }
  });
}

module.exports = errorHandler;
