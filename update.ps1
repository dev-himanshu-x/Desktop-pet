# Updates Desktop Pet to the latest release (Windows): stops it, removes the old
# version, installs the new one silently and starts it.
#   irm https://raw.githubusercontent.com/dev-himanshu-x/Desktop-pet/main/update.ps1 | iex
Get-Process "Desktop Pet" -ErrorAction SilentlyContinue | Stop-Process -Force

$keys = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
$old = Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object DisplayName -eq "Desktop Pet" | Select-Object -First 1
if ($old) {
  Start-Process -FilePath ($old.UninstallString -replace '^"|".*$', '') -ArgumentList "/S" -Wait
}

$url = "https://github.com/dev-himanshu-x/Desktop-pet/releases/latest/download/desktop-pet-windows.exe"
$out = Join-Path $env:TEMP "DesktopPetSetup.exe"
Invoke-WebRequest $url -OutFile $out
Start-Process $out -ArgumentList "/S" -Wait

$new = Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object DisplayName -eq "Desktop Pet" | Select-Object -First 1
$exe = if ($new -and $new.InstallLocation) { Join-Path $new.InstallLocation "Desktop Pet.exe" } else { "$env:LOCALAPPDATA\Programs\desktop-pet\Desktop Pet.exe" }
if (Test-Path $exe) { Start-Process $exe; Write-Host "Updated and started." } else { Write-Host "Updated. Start Desktop Pet from the Start menu." }
