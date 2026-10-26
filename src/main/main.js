const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const { createTray } = require('./tray');
const { getStore } = require('./store');

let petWindow = null;

function createPetWindow() {
  const { bounds } = screen.getPrimaryDisplay();

  petWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs require() for the shared pet catalog module
      backgroundThrottling: false,
    },
  });

  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.setIgnoreMouseEvents(true, { forward: true });
  petWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

// The window spans the full display bounds (so it stays visible over
// fullscreen apps), but "ground" for the pet should be the visible desktop
// floor — i.e. just above the Dock/taskbar — not the literal bottom edge of
// the physical screen, which can be behind OS chrome.
function usableHeight() {
  const { bounds, workArea } = screen.getPrimaryDisplay();
  return workArea.y + workArea.height - bounds.y;
}

function updateWindowBounds() {
  if (!petWindow) return;
  const { bounds } = screen.getPrimaryDisplay();
  petWindow.setBounds(bounds);
  petWindow.webContents.send('pet:screen-resized', { screenWidth: bounds.width, usableHeight: usableHeight() });
}

function setIgnoreMouse(ignore) {
  if (!petWindow) return;
  petWindow.setIgnoreMouseEvents(ignore, { forward: true });
}

function setPetType(petId) {
  getStore().set('currentPetId', petId);
  if (petWindow) petWindow.webContents.send('pet:set-type', petId);
}

function setVisibility(visible) {
  getStore().set('visible', visible);
  if (petWindow) petWindow.webContents.send('pet:set-visibility', visible);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  createPetWindow();

  screen.on('display-metrics-changed', updateWindowBounds);
  screen.on('display-added', updateWindowBounds);
  screen.on('display-removed', updateWindowBounds);

  ipcMain.on('pet:set-ignore-mouse', (_event, ignore) => setIgnoreMouse(ignore));

  ipcMain.on('pet:ready', () => {
    if (!petWindow) return;
    const store = getStore();
    const { bounds } = screen.getPrimaryDisplay();
    petWindow.webContents.send('pet:initial-state', {
      petId: store.get('currentPetId'),
      visible: store.get('visible'),
      screenWidth: bounds.width,
      usableHeight: usableHeight(),
    });
  });

  createTray({ setPetType, setVisibility });
});

app.on('window-all-closed', (event) => {
  // Tray app: keep running even if the (hidden/frameless) pet window closes.
  event.preventDefault();
});
