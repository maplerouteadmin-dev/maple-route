# Opens Maple Route without Claude or a dev server: if nothing answers on port 5174 it (re)builds the
# app when the source is newer than the last build, starts scripts/serve.mjs hidden, waits for it,
# then opens the app window. A running dev server (npm run dev) on 5174 is simply used as it is.
param([string]$Source = 'MapleStory', [int]$Port = 5174, [switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$url = "http://localhost:$Port/#navigate"

# "Open with MapleStory" is installed but its watcher is not running (it only starts at sign-in, and
# can stop): start it again, so the next game launch opens Maple Route.
$autostart = Join-Path ([Environment]::GetFolderPath('Startup')) 'Maple Route (with MapleStory).lnk'
if ((Test-Path $autostart) -and -not (Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'watch-maple\.ps1' })) {
  Start-Process explorer.exe -ArgumentList "`"$autostart`""
}

function Test-Up { try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$Port/").StatusCode -eq 200 } catch { $false } }

# Our own server still running an older build (code changed since): stop it so it is rebuilt below.
# A Vite dev server (npm run dev) is never touched: it always serves the current code.
$built = Join-Path $root 'dist\index.html'
$newest = Get-ChildItem (Join-Path $root 'src'), (Join-Path $root 'scripts'), (Join-Path $root 'index.html') -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$stale = -not (Test-Path $built) -or $newest.LastWriteTime -gt (Get-Item $built).LastWriteTime
if ($stale) {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'serve\.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Milliseconds 400
}

if (-not (Test-Up)) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { $node = "$env:ProgramFiles\nodejs\node.exe" }
  $built = Join-Path $root 'dist\index.html'
  $newest = Get-ChildItem (Join-Path $root 'src'), (Join-Path $root 'index.html') -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not (Test-Path $built) -or $newest.LastWriteTime -gt (Get-Item $built).LastWriteTime) {
    $npm = Join-Path (Split-Path $node) 'npm.cmd'
    Start-Process -FilePath $npm -ArgumentList 'run', 'build' -WorkingDirectory $root -WindowStyle Hidden -Wait
  }
  Start-Process -FilePath $node -ArgumentList "`"$(Join-Path $root 'scripts\serve.mjs')`"", $Port -WorkingDirectory $root -WindowStyle Hidden
  for ($i = 0; $i -lt 40 -and -not (Test-Up); $i++) { Start-Sleep -Milliseconds 250 }
  # Mark this build as current so the next launch does not restart the server again.
  if (Test-Path $built) { (Get-Item $built).LastWriteTime = Get-Date }
}

if ($NoOpen) { if (Test-Up) { 'up' } else { 'down' }; return }
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$profileDir = Join-Path $env:LOCALAPPDATA 'MapleRoute\EdgeProfile'
Start-Process -FilePath $edge -ArgumentList "--user-data-dir=`"$profileDir`"", '--no-first-run', "--app=$url", "--auto-select-desktop-capture-source=`"$Source`""
