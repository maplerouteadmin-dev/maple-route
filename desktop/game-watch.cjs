// Is MapleStory running? Lists running programs by name only (like the Windows "open with MapleStory"
// watcher): reads /proc/<pid>/cmdline of this user's processes, never opens or touches the game.
const { readdirSync, readFileSync } = require('node:fs');

const isMapleCommand = cmdline => /(^|[\\/])MapleStory\.exe(\0|$|\s)/i.test(String(cmdline ?? ''));

function mapleRunning(proc = '/proc') {
  let pids = [];
  try { pids = readdirSync(proc).filter(name => /^\d+$/.test(name)); } catch { return false; }
  for (const pid of pids) {
    try { if (isMapleCommand(readFileSync(`${proc}/${pid}/cmdline`, 'latin1'))) return true; } catch { /* gone or not ours */ }
  }
  return false;
}

module.exports = { isMapleCommand, mapleRunning };
