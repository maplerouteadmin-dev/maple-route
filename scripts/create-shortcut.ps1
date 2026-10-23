# Creates a "Maple Route" desktop shortcut that opens the app in its own Edge window with the screen
# picker answered automatically (Chromium's --auto-select-desktop-capture-source). A separate profile
# folder is used so the option applies even while your normal Edge is open.
# Defaults to the MapleStory window: a window share is not blocked by the pop-out sitting over the
# mini map (a whole-screen share would see the pop-out instead).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/create-shortcut.ps1 [-Screen "MapleStory" | "Screen 1"] [-Url http://localhost:5174/#navigate]
param([string]$Screen = 'MapleStory', [string]$Url = 'http://localhost:5174/#navigate')
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$profileDir = Join-Path $env:LOCALAPPDATA 'MapleRoute\EdgeProfile'
$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Maple Route.lnk'))
# Runs scripts/launch.ps1: starts the app's own small server when nothing is serving it (no Claude or
# dev server needed), then opens the app window.
$launcher = Join-Path $PSScriptRoot 'launch.ps1'
$link.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$link.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`" -Source `"$Screen`""
$link.WorkingDirectory = Split-Path $PSScriptRoot -Parent
$link.WindowStyle = 7
$link.IconLocation = "$edge,0"
$link.Description = "Maple Route (screen share auto-selects $Screen)"
$link.Save()
# A taskbar pin made from an older shortcut keeps its old settings: point it at the launcher too.
$pin = Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Maple Route.lnk'
if (Test-Path $pin) { $p = (New-Object -ComObject WScript.Shell).CreateShortcut($pin); $p.TargetPath = $link.TargetPath; $p.Arguments = $link.Arguments; $p.WorkingDirectory = $link.WorkingDirectory; $p.WindowStyle = 7; $p.IconLocation = $link.IconLocation; $p.Save() }
"Created Maple Route shortcut (auto-selects '$Screen')."
