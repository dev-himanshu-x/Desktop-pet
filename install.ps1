# Installs the latest Desktop Pet release (Windows).
#   irm https://raw.githubusercontent.com/dev-himanshu-x/Desktop-pet/main/install.ps1 | iex
$repo = "dev-himanshu-x/Desktop-pet"
$rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest"
$asset = $rel.assets | Where-Object { $_.name -match '\.exe$' } | Select-Object -First 1
if (-not $asset) { Write-Host "No Windows build found"; return }
$out = Join-Path $env:TEMP "DesktopPetSetup.exe"
Invoke-WebRequest $asset.browser_download_url -OutFile $out
Start-Process $out
