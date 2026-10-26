const Store = require('electron-store');

let storeInstance = null;

function getStore() {
  if (!storeInstance) {
    storeInstance = new Store({
      defaults: {
        currentPetId: 'white-cat',
        visible: true,
        launchAtLogin: false,
      },
    });
  }
  return storeInstance;
}

module.exports = { getStore };
