#!/bin/sh
# Installs the latest Desktop Pet release. macOS and Linux.
#   curl -fsSL https://raw.githubusercontent.com/dev-himanshu-x/Desktop-pet/main/install.sh | sh
set -e
BASE="https://github.com/dev-himanshu-x/Desktop-pet/releases/latest/download"
OS="$(uname -s)"; ARCH="$(uname -m)"
TMP="$(mktemp -d)"
if [ "$OS" = "Darwin" ]; then
  if [ "$ARCH" = "arm64" ]; then A=arm64; else A=x64; fi
  echo "Downloading Desktop Pet for macOS ($A)..."
  curl -fL "$BASE/desktop-pet-mac-$A.zip" -o "$TMP/app.zip"
  rm -rf "/Applications/Desktop Pet.app"
  unzip -q "$TMP/app.zip" -d "$TMP/out"
  mv "$TMP/out/Desktop Pet.app" /Applications/
  xattr -dr com.apple.quarantine "/Applications/Desktop Pet.app" 2>/dev/null || true
  open "/Applications/Desktop Pet.app"
  echo "Installed to /Applications and started."
else
  mkdir -p "$HOME/.local/bin"
  curl -fL "$BASE/desktop-pet-linux.AppImage" -o "$HOME/.local/bin/desktop-pet"
  chmod +x "$HOME/.local/bin/desktop-pet"
  echo "Installed. Run: ~/.local/bin/desktop-pet"
  nohup "$HOME/.local/bin/desktop-pet" >/dev/null 2>&1 &
fi
rm -rf "$TMP"
