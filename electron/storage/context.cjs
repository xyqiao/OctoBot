let storage = null;

function setStorage(next) {
  storage = next || null;
}

function getStorage() {
  return storage;
}

module.exports = {
  setStorage,
  getStorage,
};
