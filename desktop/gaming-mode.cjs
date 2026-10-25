// One-click Steam Deck setup: copies the AppImage to ~/Applications and adds a USER service that
// starts Maple Route with Gaming Mode (no root, no system changes). Maple Route then waits for
// MapleStory: it shows its pop-up and reads the screen only while the game is open.
const { copyFileSync, chmodSync, existsSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join, resolve } = require('node:path');
const { homedir } = require('node:os');

const UNIT = 'maple-route-deck.service';
const unitPath = (home = homedir()) => join(home, '.config', 'systemd', 'user', UNIT);
const appPath = (home = homedir()) => join(home, 'Applications', 'Maple-Route.AppImage');

function unitText(app) {
  return `[Unit]
Description=Maple Route (Steam Deck Gaming Mode)
After=gamescope-session.target
PartOf=gamescope-session.target

[Service]
Environment=DISPLAY=:0
ExecStart="${app}" --deck-service --lan
Restart=on-failure
RestartSec=5

[Install]
WantedBy=gamescope-session.target
`;
}

const installed = (home = homedir()) => existsSync(unitPath(home));

function install(appImage = process.env.APPIMAGE, home = homedir()) {
  if (!appImage || !existsSync(appImage)) throw new Error('Run this from the Maple Route AppImage.');
  const target = appPath(home);
  mkdirSync(join(home, 'Applications'), { recursive: true });
  if (resolve(appImage) !== resolve(target)) copyFileSync(appImage, target);
  chmodSync(target, 0o755);
  mkdirSync(join(home, '.config', 'systemd', 'user'), { recursive: true });
  writeFileSync(unitPath(home), unitText(target));
  execFileSync('systemctl', ['--user', 'daemon-reload']);
  execFileSync('systemctl', ['--user', 'enable', UNIT]);
  return target;
}

function remove(home = homedir()) {
  try { execFileSync('systemctl', ['--user', 'disable', '--now', UNIT]); } catch { /* not running */ }
  rmSync(unitPath(home), { force: true });
  try { execFileSync('systemctl', ['--user', 'daemon-reload']); } catch { /* fine */ }
}

module.exports = { UNIT, unitText, unitPath, appPath, installed, install, remove };
