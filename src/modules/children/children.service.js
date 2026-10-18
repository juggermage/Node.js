const { randomUUID } = require('node:crypto');

const children = [];
const ALLOWED_FIELDS = ['firstName', 'lastName', 'birthDate'];

function isValidBirthDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return value <= new Date().toISOString().slice(0, 10);
}

function validateChild(data, partial = false) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Request body must be an object';
  const keys = Object.keys(data);
  if (partial && keys.length === 0) return 'At least one field is required';
  if (keys.some((key) => !ALLOWED_FIELDS.includes(key))) return 'Unknown or read-only field';
  if (!partial && ALLOWED_FIELDS.some((field) => !Object.hasOwn(data, field))) return 'Required fields are missing';
  for (const field of ['firstName', 'lastName']) {
    if (Object.hasOwn(data, field) && (typeof data[field] !== 'string' || !data[field].trim())) {
      return `${field} must be a non-empty string`;
    }
  }
  if (Object.hasOwn(data, 'birthDate') && !isValidBirthDate(data.birthDate)) {
    return 'birthDate must be a valid, non-future date in YYYY-MM-DD format';
  }
  return null;
}

function getAll(search) {
  if (search === undefined) return [...children];
  if (typeof search !== 'string') return null;
  const query = search.trim().toLocaleLowerCase();
  return children.filter(({ firstName, lastName }) =>
    `${firstName} ${lastName}`.toLocaleLowerCase().includes(query) ||
    `${lastName} ${firstName}`.toLocaleLowerCase().includes(query)
  );
}

function getById(id) {
  return children.find((child) => child.id === id) || null;
}

function create(data) {
  const child = {
    id: randomUUID(),
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    birthDate: data.birthDate
  };
  children.push(child);
  return child;
}

function update(id, data) {
  const child = getById(id);
  if (!child) return null;
  for (const [key, value] of Object.entries(data)) {
    child[key] = typeof value === 'string' && key !== 'birthDate' ? value.trim() : value;
  }
  return child;
}

function remove(id) {
  const index = children.findIndex((child) => child.id === id);
  if (index === -1) return false;
  children.splice(index, 1);
  return true;
}

module.exports = { validateChild, getAll, getById, create, update, remove };