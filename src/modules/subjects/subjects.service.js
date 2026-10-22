const { randomUUID } = require("node:crypto");

const subjects = [];

const ALLOWED_FIELDS = ["name", "description"];

function createError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeName(name) {
  return name.trim().toLocaleLowerCase();
}

function validateSubject(data, partial = false) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw createError("VALIDATION_ERROR", "Request body must be an object", 422);
  }

  const fields = Object.keys(data);

  if (partial && fields.length === 0) {
    throw createError("VALIDATION_ERROR", "At least one field is required", 422);
  }

  for (const field of fields) {
    if (!ALLOWED_FIELDS.includes(field)) {
      throw createError("VALIDATION_ERROR", `Unknown or read-only field: ${field}`, 422);
    }
  }

  if (!partial && !Object.hasOwn(data, "name")) {
    throw createError("VALIDATION_ERROR", "Name is required", 422);
  }

  if (Object.hasOwn(data, "name")) {
    if (typeof data.name !== "string" || data.name.trim().length === 0) {
      throw createError("VALIDATION_ERROR", "Name must be a non-empty string", 422);
    }
  }

  if (Object.hasOwn(data, "description")) {
    if (typeof data.description !== "string") {
      throw createError("VALIDATION_ERROR", "Description must be a string", 422);
    }
  }

  if (!partial && !Object.hasOwn(data, "description")) {
    throw createError("VALIDATION_ERROR", "Description is required", 422);
  }
}

function checkDuplicate(name, excludeId = null) {
  const normalized = normalizeName(name);

  const duplicate = subjects.find(
    (subject) => subject.id !== excludeId && normalizeName(subject.name) === normalized
  );

  if (duplicate) {
    throw createError("DUPLICATE_SUBJECT", "Subject with this name already exists", 409);
  }
}

function getAll(search) {
  if (search === undefined) {
    return [...subjects];
  }

  if (typeof search !== "string") {
    throw createError("INVALID_SEARCH", "Search parameter must be a string", 400);
  }

  const query = normalizeName(search);

  return subjects.filter((subject) => normalizeName(subject.name).includes(query));
}

function getById(id) {
  return subjects.find((subject) => subject.id === id) || null;
}

function create(data) {
  validateSubject(data);
  checkDuplicate(data.name);

  const subject = {
    id: randomUUID(),
    name: data.name.trim(),
    description: data.description.trim()
  };

  subjects.push(subject);

  return subject;
}

function update(id, data) {
  const subject = getById(id);

  if (!subject) {
    return null;
  }

  validateSubject(data, true);

  if (Object.hasOwn(data, "name")) {
    checkDuplicate(data.name, id);
  }

  const updatedSubject = {
    ...subject,
    ...(Object.hasOwn(data, "name") ? { name: data.name.trim() } : {}),
    ...(Object.hasOwn(data, "description") ? { description: data.description.trim() } : {})
  };

  const index = subjects.findIndex((item) => item.id === id);

  subjects[index] = updatedSubject;

  return updatedSubject;
}

function remove(id) {
  const index = subjects.findIndex((subject) => subject.id === id);

  if (index === -1) {
    return false;
  }

  subjects.splice(index, 1);

  return true;
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
