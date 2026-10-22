const MIN_AGE = 2;
const MAX_AGE = 5;

let groups = [
  { id: "1", name: "A2", ageCategory: 2 },
  { id: "2", name: "A3", ageCategory: 3 },
  { id: "3", name: "A4", ageCategory: 4 },
  { id: "4", name: "A5", ageCategory: 5 }
];

let nextId = 5;

function createHttpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function validateName(name) {
  if (typeof name !== "string" || name.trim() === "") {
    throw createHttpError(422, "INVALID_GROUP_NAME", "Group name is required and cannot be empty");
  }
}

function validateAgeCategory(ageValue) {
  if (
    ageValue === undefined ||
    ageValue === null ||
    String(ageValue).trim() === "" ||
    typeof ageValue === "boolean"
  ) {
    throw createHttpError(
      422,
      "INVALID_AGE_CATEGORY",
      `Age category is required and must be between ${MIN_AGE} and ${MAX_AGE} years`
    );
  }

  const age = Number(ageValue);
  if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
    throw createHttpError(
      422,
      "INVALID_AGE_CATEGORY",
      `Age category must be an integer between ${MIN_AGE} and ${MAX_AGE} years`
    );
  }

  return age;
}

async function getAllGroups(query = {}) {
  let result = [...groups];

  // 1. Фільтрація та валідація за ageCategory (якщо параметр передано в URL)
  if (query.ageCategory !== undefined) {
    const validAge = validateAgeCategory(query.ageCategory);
    result = result.filter((group) => group.ageCategory === validAge);
  }

  // 2. Пошук за назвою без урахування регістру (якщо параметр search передано)
  if (query.search !== undefined && String(query.search).trim() !== "") {
    const searchLower = String(query.search).trim().toLowerCase();
    result = result.filter((group) => group.name.toLowerCase().includes(searchLower));
  }

  return result;
}

async function getGroupById(id) {
  const group = groups.find((item) => item.id === String(id));
  if (!group) {
    throw createHttpError(404, "GROUP_NOT_FOUND", "Group not found");
  }
  return group;
}

async function createGroup(body = {}) {
  validateName(body.name);

  const rawAge = body.ageCategory !== undefined ? body.ageCategory : body.age;
  const validAge = validateAgeCategory(rawAge);

  const newGroup = {
    id: String(nextId++),
    name: body.name.trim(),
    ageCategory: validAge
  };

  groups.push(newGroup);
  return newGroup;
}

async function updateGroup(id, body = {}) {
  const groupIndex = groups.findIndex((item) => item.id === String(id));
  if (groupIndex === -1) {
    throw createHttpError(404, "GROUP_NOT_FOUND", "Group not found");
  }

  if (body.id !== undefined || body._id !== undefined) {
    throw createHttpError(400, "FORBIDDEN_FIELD", "Updating group ID is not allowed");
  }

  const currentGroup = groups[groupIndex];
  let updatedName = currentGroup.name;
  let updatedAge = currentGroup.ageCategory;

  if (body.name !== undefined) {
    validateName(body.name);
    updatedName = body.name.trim();
  }

  const rawAge = body.ageCategory !== undefined ? body.ageCategory : body.age;
  if (rawAge !== undefined) {
    updatedAge = validateAgeCategory(rawAge);
  }

  const updatedGroup = {
    ...currentGroup,
    name: updatedName,
    ageCategory: updatedAge
  };

  groups[groupIndex] = updatedGroup;
  return updatedGroup;
}

async function deleteGroup(id) {
  const groupIndex = groups.findIndex((item) => item.id === String(id));
  if (groupIndex === -1) {
    throw createHttpError(404, "GROUP_NOT_FOUND", "Group not found");
  }

  groups.splice(groupIndex, 1);
}

module.exports = {
  getAllGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup
};
