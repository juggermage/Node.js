const parentsService = require("./parents.service");

const FIELDS = ["firstName", "lastName", "middleName", "phone", "email"];
const PHONE_REGEX = /^\+380\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DUPLICATE_MESSAGES = {
  DUPLICATE_EMAIL: "Батько з таким email вже існує",
  DUPLICATE_PHONE: "Батько з таким телефоном вже існує"
};

function sendSuccess(res, status, data) {
  return res.status(status).json({ success: true, data });
}

function sendError(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}

function sendNotFound(res) {
  return sendError(res, 404, "PARENT_NOT_FOUND", "Батька не знайдено");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateParentData(body, { requireAll }) {
  const errors = [];
  const data = {};

  const unknownFields = Object.keys(body).filter((key) => !FIELDS.includes(key));

  if (unknownFields.length > 0) {
    errors.push(`Недозволені поля: ${unknownFields.join(", ")}`);
  }

  for (const field of FIELDS) {
    if (!Object.hasOwn(body, field)) {
      if (requireAll) {
        errors.push(`Поле ${field} є обов'язковим`);
      }
      continue;
    }

    const value = body[field];

    if (typeof value !== "string") {
      errors.push(`Поле ${field} має бути рядком`);
      continue;
    }

    const trimmed = value.trim();

    if (trimmed === "") {
      errors.push(`Поле ${field} не може бути порожнім`);
      continue;
    }

    if (field === "phone" && !PHONE_REGEX.test(trimmed)) {
      errors.push("Телефон має бути у форматі +380XXXXXXXXX");
      continue;
    }

    if (field === "email" && !EMAIL_REGEX.test(trimmed)) {
      errors.push("Email має некоректний формат");
      continue;
    }

    data[field] = trimmed;
  }

  if (!requireAll && Object.keys(body).length === 0) {
    errors.push("Не передано жодного поля для оновлення");
  }

  return { errors, data };
}

function getParents(req, res) {
  const { search } = req.query;

  if (search !== undefined && typeof search !== "string") {
    return sendError(res, 400, "INVALID_REQUEST", "Параметр search має бути рядком");
  }

  const parents = parentsService.getAll(search ? search.trim() : "");

  return sendSuccess(res, 200, parents);
}

function getParentById(req, res) {
  const parent = parentsService.getById(req.params.id);

  if (!parent) {
    return sendNotFound(res);
  }

  return sendSuccess(res, 200, parent);
}

function createParent(req, res) {
  if (!isPlainObject(req.body)) {
    return sendError(res, 400, "INVALID_REQUEST", "Тіло запиту має бути JSON-об'єктом");
  }

  const { errors, data } = validateParentData(req.body, { requireAll: true });

  if (errors.length > 0) {
    return sendError(res, 422, "VALIDATION_ERROR", errors.join("; "));
  }

  const duplicate = parentsService.findDuplicate(data);

  if (duplicate) {
    return sendError(res, 409, duplicate, DUPLICATE_MESSAGES[duplicate]);
  }

  const parent = parentsService.create(data);

  return sendSuccess(res, 201, parent);
}

function updateParent(req, res) {
  if (!isPlainObject(req.body)) {
    return sendError(res, 400, "INVALID_REQUEST", "Тіло запиту має бути JSON-об'єктом");
  }

  const { errors, data } = validateParentData(req.body, { requireAll: false });

  if (errors.length > 0) {
    return sendError(res, 422, "VALIDATION_ERROR", errors.join("; "));
  }

  const { id } = req.params;

  if (!parentsService.getById(id)) {
    return sendNotFound(res);
  }

  const duplicate = parentsService.findDuplicate(data, id);

  if (duplicate) {
    return sendError(res, 409, duplicate, DUPLICATE_MESSAGES[duplicate]);
  }

  const parent = parentsService.update(id, data);

  return sendSuccess(res, 200, parent);
}

function deleteParent(req, res) {
  const deleted = parentsService.remove(req.params.id);

  if (!deleted) {
    return sendNotFound(res);
  }

  return res.status(204).end();
}

module.exports = {
  getParents,
  getParentById,
  createParent,
  updateParent,
  deleteParent
};
