const test = require('node:test');
const assert = require('node:assert/strict');
const { unitText, unitPath, appPath } = require('./gaming-mode.cjs');

test('the Gaming Mode service starts with Gaming Mode, as the user, and restarts after a crash', () => {
  const text = unitText('/home/deck/Applications/Maple-Route.AppImage');
  assert.match(text, /WantedBy=gamescope-session\.target/);
  assert.match(text, /ExecStart="\/home\/deck\/Applications\/Maple-Route\.AppImage" --deck-service --lan/);
  assert.match(text, /Restart=on-failure/);
  assert.equal(unitPath('/home/deck').replace(/\\/g, '/'), '/home/deck/.config/systemd/user/maple-route-deck.service');
  assert.equal(appPath('/home/deck').replace(/\\/g, '/'), '/home/deck/Applications/Maple-Route.AppImage');
});
