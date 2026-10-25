const test = require('node:test');
const assert = require('node:assert/strict');
const { unpacked } = require('./unpacked.cjs');

test('Python helpers start from outside the app archive', () => {
  assert.equal(unpacked('/tmp/.mount_X/resources/app.asar/desktop/deck-pipewire.py'), '/tmp/.mount_X/resources/app.asar.unpacked/desktop/deck-pipewire.py');
  assert.equal(unpacked('/home/deck/app/desktop/deck-pipewire.py'), '/home/deck/app/desktop/deck-pipewire.py');
});
