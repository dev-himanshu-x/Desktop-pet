#!/bin/sh
# Installs the latest Desktop Pet release. macOS and Linux.
#   curl -fsSL https://raw.githubusercontent.com/dev-himanshu-x/Desktop-pet/main/install.sh | sh
set -e
REPO="dev-himanshu-x/Desktop-pet"
OS="$(uname -s)"; ARCH="$(uname -m)"
URLS="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep -o '"browser_download_url": *"[^"]*"' | cut -d'"' -f4)"
[ -n "$URLS" ] || { echo "No release found yet for $REPO"; exit 1; }

TMP="$(mktemp -d)"
if [ "$OS" = "Darwin" ]; then
  if [ "$ARCH" = "arm64" ]; then URL="$(echo "$URLS" | grep -i 'arm64-mac\.zip$' | head -1)"
  else URL="$(echo "$URLS" | grep -i 'mac\.zip$' | grep -vi arm64 | head -1)"; fi
  [ -n "$URL" ] || { echo "No macOS build found"; exit 1; }
  echo "Downloading $URL"
  curl -fL "$URL" -o "$TMP/app.zip"
  rm -rf "/Applications/Desktop Pet.app"
  unzip -q "$TMP/app.zip" -d "$TMP/out"
  mv "$TMP/out/Desktop Pet.app" /Applications/
  xattr -dr com.apple.quarantine "/Applications/Desktop Pet.app" 2>/dev/null || true
  open "/Applications/Desktop Pet.app"
  echo "Installed to /Applications and started."
else
  URL="$(echo "$URLS" | grep -i 'AppImage$' | head -1)"
  [ -n "$URL" ] || { echo "No Linux build found"; exit 1; }
  mkdir -p "$HOME/.local/bin"
  curl -fL "$URL" -o "$HOME/.local/bin/desktop-pet"
  chmod +x "$HOME/.local/bin/desktop-pet"
  echo "Installed. Run: ~/.local/bin/desktop-pet"
  nohup "$HOME/.local/bin/desktop-pet" >/dev/null 2>&1 &
fi
rm -rf "$TMP"
