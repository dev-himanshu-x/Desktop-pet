# Desktop Pet

A small animated cat that roams your desktop, always on top of every window.
Control it from the tray/menu-bar icon (change cat colour, hide/show, autostart).

## Install (one command)

**macOS / Linux**
```
curl -fsSL https://raw.githubusercontent.com/dev-himanshu-x/Desktop-pet/main/install.sh | sh
```

**Windows** (PowerShell)
```
irm https://raw.githubusercontent.com/dev-himanshu-x/Desktop-pet/main/install.ps1 | iex
```

## Install (manual download)

Download the file for your OS from the [Releases](../../releases) page:

| OS | File |
|----|------|
| macOS (Apple Silicon / Intel) | `Desktop Pet-*.dmg` |
| Windows | `Desktop Pet Setup *.exe` |
| Linux | `Desktop Pet-*.AppImage` or `.deb` |

The builds are not code-signed, so your OS will warn on first launch:
- **macOS:** right-click the app → **Open** → **Open** (or System Settings → Privacy & Security → *Open Anyway*).
- **Windows:** SmartScreen → **More info** → **Run anyway**.
- **Linux AppImage:** `chmod +x "Desktop Pet-*.AppImage"` then run it.

## Develop

```
npm install
npm start
```

## Release

Bump `version` in `package.json`, then push a tag; GitHub Actions builds all three platforms and attaches them to a release:

```
git tag v1.0.1 && git push origin v1.0.1
```

Local builds: `npm run build:mac`, `build:win`, `build:linux` (output in `dist/`).
