# Makes Maple Route open by itself when MapleStory starts: puts a "Maple Route (with MapleStory)"
# shortcut in your Startup folder that runs scripts/watch-maple.ps1 hidden at sign-in, and starts the
# watcher now. Remove it any time with -Remove (or delete that shortcut from shell:startup).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/install-autostart.ps1 [-Remove]
param([switch]$Remove)
$startup = [Environment]::GetFolderPath('Startup')
$path = Join-Path $startup 'Maple Route (with MapleStory).lnk'
$watcher = Join-Path $PSScriptRoot 'watch-maple.ps1'
$running = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'watch-maple\.ps1' }

if ($Remove) {
  if (Test-Path $path) { Remove-Item $path }
  $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  'Maple Route will no longer open with MapleStory.'
  return
}

$link = (New-Object -ComObject WScript.Shell).CreateShortcut($path)
$link.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$link.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watcher`""
$link.WorkingDirectory = Split-Path $PSScriptRoot -Parent
$link.WindowStyle = 7
$link.Description = 'Opens Maple Route when MapleStory starts'
$link.Save()
if (-not $running) { Start-Process explorer.exe -ArgumentList "`"$path`"" }
'Maple Route will now open by itself when MapleStory starts.'
