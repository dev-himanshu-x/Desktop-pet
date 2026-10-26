# Installs the latest Desktop Pet release (Windows).
#   irm https://raw.githubusercontent.com/dev-himanshu-x/Desktop-pet/main/install.ps1 | iex
$url = "https://github.com/dev-himanshu-x/Desktop-pet/releases/latest/download/desktop-pet-windows.exe"
$out = Join-Path $env:TEMP "DesktopPetSetup.exe"
Invoke-WebRequest $url -OutFile $out
Start-Process $out
