const HTTP_STATUS = require("../utils/http-status");

function validate(schema, source = "body") {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      allowUnknown: false
    });

    if (error) {
      return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: error.details.map((item) => item.message)
        }
      });
    }

    res.locals.validated ??= {};
    res.locals.validated[source] = value;

    return next();
  };
}

module.exports = validate;
