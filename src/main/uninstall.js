const { app, dialog } = require('electron');
const fs = require('fs');
const autostart = require('./autostart');

// There is no cross-platform in-app "uninstall" API. This does the best an
// app can do from the inside: stop itself, remove its autostart entry, and
// delete its own config/data. Real removal of the installed binary is the
// OS-native path (Trash the .app / Windows "Apps & Features" uninstaller /
// `dpkg -r` or deleting the AppImage) — the confirmation dialog says so.
function quitAndRemove() {
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    buttons: ['Cancel', 'Quit & Remove'],
    defaultId: 0,
    cancelId: 0,
    title: 'Quit & Remove Desktop Pet',
    message: 'Quit Desktop Pet and remove its settings?',
    detail:
      'This stops the pet, removes it from Login Items, and deletes its saved settings.\n\n' +
      'To fully uninstall the app itself, also move Desktop Pet to the Trash ' +
      '(macOS), remove it from "Apps & Features" (Windows), or remove the ' +
      'package (Linux).',
  });

  if (choice !== 1) return;

  try {
    autostart.disable();
  } catch (_err) {
    // best-effort
  }

  try {
    fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
  } catch (_err) {
    // best-effort
  }

  app.quit();
}

module.exports = { quitAndRemove };
