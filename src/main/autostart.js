const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

function desktopFilePath() {
  return path.join(os.homedir(), '.config', 'autostart', 'desktop-pet.desktop');
}

function enable() {
  if (process.platform === 'linux') {
    const dir = path.join(os.homedir(), '.config', 'autostart');
    fs.mkdirSync(dir, { recursive: true });
    const execPath = process.env.APPIMAGE || process.execPath;
    const contents = `[Desktop Entry]
Type=Application
Name=Desktop Pet
Exec=${execPath} --hidden
X-GNOME-Autostart-enabled=true
`;
    fs.writeFileSync(desktopFilePath(), contents);
    return;
  }
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
}

function disable() {
  if (process.platform === 'linux') {
    try {
      fs.unlinkSync(desktopFilePath());
    } catch (_err) {
      // not present — nothing to remove
    }
    return;
  }
  app.setLoginItemSettings({ openAtLogin: false });
}

function isEnabled() {
  if (process.platform === 'linux') {
    return fs.existsSync(desktopFilePath());
  }
  return app.getLoginItemSettings().openAtLogin;
}

module.exports = { enable, disable, isEnabled };
