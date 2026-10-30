const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldShowPairing } = require('./overlay-choice.cjs');

test('pairing can be dismissed without stopping the map reader', () => {
  const state = { hasQr: true, phoneConnected: false, early: true, reading: false };
  assert.equal(shouldShowPairing({ ...state, dismissed: false }), true);
  assert.equal(shouldShowPairing({ ...state, dismissed: true }), false);
  assert.equal(shouldShowPairing({ ...state, early: false, reading: true, dismissed: false }), false);
  assert.equal(shouldShowPairing({ ...state, early: false, reading: true, dismissed: false, forced: true }), true);
  assert.equal(shouldShowPairing({ ...state, phoneConnected: true, dismissed: false }), false);
});
