const test = require('node:test');
const assert = require('node:assert/strict');
const { isMapleCommand } = require('./game-watch.cjs');

test('MapleStory is spotted by its program name, not by the launcher or Maple Route', () => {
  assert.ok(isMapleCommand('Z:\\home\\deck\\.local\\share\\Steam\\steamapps\\common\\MapleStory\\MSCW\\MapleStory.exe\0'));
  assert.ok(isMapleCommand('C:\\Nexon\\MapleStory.exe'));
  assert.ok(!isMapleCommand('/home/deck/Applications/Maple-Route.AppImage\0--deck-service'));
  assert.ok(!isMapleCommand('c:\\windows\\system32\\steam.exe ms-launcher.exe --mscw:MSCW\\MapleStoryLauncher.exe'));
});
