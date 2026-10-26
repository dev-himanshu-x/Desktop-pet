const { Tray, Menu, app, dialog } = require('electron');
const path = require('path');
const { getStore } = require('./store');
const autostart = require('./autostart');
const { quitAndRemove } = require('./uninstall');
const catalog = require('../renderer/pets/catalog');

let tray = null;

function trayIconPath() {
  const buildDir = path.join(__dirname, '..', '..', 'build');
  return process.platform === 'darwin'
    ? path.join(buildDir, 'trayTemplate.png')
    : path.join(buildDir, 'tray.png');
}

function createTray({ setPetType, setVisibility }) {
  const store = getStore();
  tray = new Tray(trayIconPath());
  tray.setToolTip('Desktop Pet');

  function rebuild() {
    const currentPetId = store.get('currentPetId');
    const visible = store.get('visible');

    const petItems = catalog.length
      ? catalog.map((pet) => ({
          label: pet.name,
          type: 'radio',
          checked: pet.id === currentPetId,
          click: () => {
            setPetType(pet.id);
            rebuild();
          },
        }))
      : [{ label: 'No pets installed', enabled: false }];

    const menu = Menu.buildFromTemplate([
      { label: 'Desktop Pet', enabled: false },
      { type: 'separator' },
      { label: 'Change Pet', submenu: petItems },
      { type: 'separator' },
      {
        label: visible ? 'Hide Pet' : 'Show Pet',
        click: () => {
          setVisibility(!visible);
          rebuild();
        },
      },
      {
        label: 'Launch at Login',
        type: 'checkbox',
        checked: autostart.isEnabled(),
        click: (menuItem) => {
          if (menuItem.checked) {
            autostart.enable();
          } else {
            autostart.disable();
          }
          store.set('launchAtLogin', menuItem.checked);
        },
      },
      { type: 'separator' },
      {
        label: 'About Desktop Pet',
        click: () => {
          dialog.showMessageBox({
            type: 'info',
            title: 'Desktop Pet',
            message: 'Desktop Pet',
            detail: `A small animated pet that roams your screen.\nVersion ${app.getVersion()}`,
          });
        },
      },
      {
        label: 'Quit & Remove',
        click: () => quitAndRemove(),
      },
    ]);

    tray.setContextMenu(menu);
  }

  rebuild();
  return tray;
}

module.exports = { createTray };
