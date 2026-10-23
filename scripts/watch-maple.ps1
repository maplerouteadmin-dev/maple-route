# Opens Maple Route whenever MapleStory starts. Runs hidden from the Windows Startup folder (see
# scripts/install-autostart.ps1). Every 5 seconds: if the game is running and no Maple Route window is
# open, run launch.ps1 once; then wait until the game closes before watching again.
# Only process names and window command lines are looked at; the game itself is never touched.
$launcher = Join-Path $PSScriptRoot 'launch.ps1'

function Test-AppOpen {
  [bool](Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'MapleRoute\\EdgeProfile' -and $_.CommandLine -notmatch '--type=' })
}

while ($true) {
  if (Get-Process -Name 'MapleStory' -ErrorAction SilentlyContinue) {
    # Switched off in the app's Settings: this flag file exists.
    $off = Test-Path (Join-Path $env:LOCALAPPDATA 'MapleRoute\autostart-off')
    if (-not $off -and -not (Test-AppOpen)) {
      Start-Sleep -Seconds 3 # let the game window appear so the share can pick it
      & powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $launcher
    }
    while (Get-Process -Name 'MapleStory' -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 5 }
  }
  Start-Sleep -Seconds 5
}
