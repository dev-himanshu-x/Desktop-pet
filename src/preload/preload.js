const { contextBridge, ipcRenderer } = require('electron');
const catalog = require('../renderer/pets/catalog');
const spriteManifest = require('../renderer/assets/sprites/manifest.json');

contextBridge.exposeInMainWorld('petAPI', {
  catalog,
  spriteManifest,
  onSetPetType: (callback) => ipcRenderer.on('pet:set-type', (_event, petId) => callback(petId)),
  onSetVisibility: (callback) => ipcRenderer.on('pet:set-visibility', (_event, visible) => callback(visible)),
  onScreenResized: (callback) => ipcRenderer.on('pet:screen-resized', (_event, payload) => callback(payload)),
  onInitialState: (callback) => ipcRenderer.on('pet:initial-state', (_event, state) => callback(state)),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('pet:set-ignore-mouse', ignore),
  ready: () => ipcRenderer.send('pet:ready'),
});
