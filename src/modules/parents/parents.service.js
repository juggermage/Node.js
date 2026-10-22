const { randomUUID } = require("node:crypto");

const parents = [];

function getAll(search) {
  if (!search) {
    return parents.map((parent) => ({ ...parent }));
  }

  const query = search.toLowerCase();

  return parents
    .filter((parent) => parent.lastName.toLowerCase().includes(query))
    .map((parent) => ({ ...parent }));
}

function getById(id) {
  const parent = parents.find((item) => item.id === id);

  return parent ? { ...parent } : null;
}

function findDuplicate(data, excludeId) {
  const others = parents.filter((parent) => parent.id !== excludeId);

  if (data.email !== undefined) {
    const email = data.email.toLowerCase();

    if (others.some((parent) => parent.email.toLowerCase() === email)) {
      return "DUPLICATE_EMAIL";
    }
  }

  if (data.phone !== undefined) {
    if (others.some((parent) => parent.phone === data.phone)) {
      return "DUPLICATE_PHONE";
    }
  }

  return null;
}

function create(data) {
  const parent = {
    id: randomUUID(),
    firstName: data.firstName,
    lastName: data.lastName,
    middleName: data.middleName,
    phone: data.phone,
    email: data.email
  };

  parents.push(parent);

  return { ...parent };
}

function update(id, data) {
  const parent = parents.find((item) => item.id === id);

  if (!parent) {
    return null;
  }

  Object.assign(parent, data);

  return { ...parent };
}

function remove(id) {
  const index = parents.findIndex((item) => item.id === id);

  if (index === -1) {
    return false;
  }

  parents.splice(index, 1);

  return true;
}

module.exports = { getAll, getById, findDuplicate, create, update, remove };
