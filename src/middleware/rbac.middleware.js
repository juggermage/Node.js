const HTTP_STATUS = require("../utils/http-status");

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication is required"
        }
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action"
        }
      });
    }

    return next();
  };
}

module.exports = authorizeRoles;
